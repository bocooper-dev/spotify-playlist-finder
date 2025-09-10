/**
 * Spotify API Client Library
 * 
 * Provides a comprehensive interface to the Spotify Web API with built-in
 * rate limiting, error handling, caching, and N8N workflow integration.
 * 
 * Features:
 * - OAuth 2.0 Client Credentials Flow
 * - Automatic token management via N8N workflows
 * - Rate limiting with intelligent backoff
 * - Response caching with TTL
 * - Error classification and retry logic
 * - Type-safe API responses
 */

import type { 
  Playlist, 
  PlaylistOwner, 
  SearchRequest, 
  SearchResult, 
  SearchMetadata,
  Genre 
} from '~/types'

export interface SpotifyClientConfig {
  clientId: string
  clientSecret: string
  n8nWebhookUrl: string
  n8nApiKey: string
  rateLimit: {
    requestsPerMinute: number
    burstLimit: number
  }
  cache: {
    tokenTtl: number
    responseTtl: number
  }
  retry: {
    maxRetries: number
    baseDelay: number
    maxDelay: number
  }
}

export interface SpotifyApiResponse<T = any> {
  data: T
  cached: boolean
  rateLimit: {
    remaining: number
    resetTime: number
  }
  requestId: string
}

export interface SpotifyErrorDetails {
  status: number
  message: string
  code?: string
  retryAfter?: number
}

export class SpotifyApiError extends Error {
  constructor(
    message: string,
    public details: SpotifyErrorDetails,
    public retryable: boolean = false
  ) {
    super(message)
    this.name = 'SpotifyApiError'
  }
}

export class SpotifyClient {
  private config: SpotifyClientConfig
  private accessToken: string | null = null
  private tokenExpiresAt: number = 0
  private rateLimiter: RateLimiter
  private cache: CacheManager

  constructor(config: SpotifyClientConfig) {
    this.config = config
    this.rateLimiter = new RateLimiter(config.rateLimit)
    this.cache = new CacheManager(config.cache)
  }

  /**
   * Initialize the client and obtain access token
   */
  async initialize(): Promise<void> {
    await this.ensureValidToken()
  }

  /**
   * Search for playlists by genre with intelligent filtering
   */
  async searchPlaylists(request: SearchRequest): Promise<SearchResult> {
    const startTime = Date.now()
    const requestId = `search_${startTime}_${Math.random().toString(36).substr(2, 9)}`
    
    // Validate request
    await this.validateSearchRequest(request)
    
    // Check cache first
    const cacheKey = this.generateCacheKey('search', request)
    const cached = await this.cache.get<SearchResult>(cacheKey)
    if (cached) {
      return {
        ...cached,
        searchMetadata: {
          ...cached.searchMetadata,
          cacheHit: true,
          requestId
        }
      }
    }

    try {
      // Validate genres first
      const validGenres = await this.validateGenres(request.genres)
      if (validGenres.invalidCount > 0) {
        throw new SpotifyApiError(
          'Invalid genres provided',
          {
            status: 400,
            message: `Invalid genres: ${validGenres.invalidGenres.map(g => g.requested).join(', ')}`,
            code: 'INVALID_GENRES'
          }
        )
      }

      // Execute search with rate limiting
      const searchResults = await this.executePlaylistSearch(request, requestId)
      
      // Enhance with additional data if needed
      const enhancedResults = request.enhanceWithScraping ? 
        await this.enhancePlaylistsWithScraping(searchResults.playlists) : 
        searchResults.playlists

      // Build final result
      const result: SearchResult = {
        requestId,
        playlists: enhancedResults.slice(0, 50), // Ensure max 50 results
        totalFound: enhancedResults.length,
        searchMetadata: {
          executionTime: Date.now() - startTime,
          genresSearched: validGenres.validGenres,
          genresNotFound: [],
          apiCallsCount: searchResults.apiCallsCount,
          cacheHit: false,
          warnings: searchResults.warnings
        }
      }

      // Cache the result
      await this.cache.set(cacheKey, result, this.config.cache.responseTtl)

      return result

    } catch (error: any) {
      if (error instanceof SpotifyApiError) {
        throw error
      }
      
      throw new SpotifyApiError(
        'Playlist search failed',
        {
          status: 500,
          message: error.message || 'Unknown error during search',
          code: 'SEARCH_FAILED'
        }
      )
    }
  }

  /**
   * Get detailed playlist information by ID
   */
  async getPlaylist(playlistId: string): Promise<Playlist> {
    await this.validatePlaylistId(playlistId)
    
    const cacheKey = this.generateCacheKey('playlist', { id: playlistId })
    const cached = await this.cache.get<Playlist>(cacheKey)
    if (cached) return cached

    await this.ensureValidToken()
    await this.rateLimiter.waitForSlot()

    try {
      const response = await this.makeApiRequest(`/playlists/${playlistId}`, {
        fields: 'id,name,description,external_urls,images,followers,tracks(total),owner(id,display_name,external_urls,followers),public,snapshot_id'
      })

      const playlist = this.transformPlaylistResponse(response.data)
      await this.cache.set(cacheKey, playlist, this.config.cache.responseTtl)

      return playlist

    } catch (error: any) {
      throw this.handleApiError(error, 'Failed to fetch playlist')
    }
  }

  /**
   * Get available genre seeds from Spotify
   */
  async getAvailableGenres(): Promise<Genre[]> {
    const cacheKey = this.generateCacheKey('genres', {})
    const cached = await this.cache.get<Genre[]>(cacheKey)
    if (cached) return cached

    await this.ensureValidToken()
    await this.rateLimiter.waitForSlot()

    try {
      const response = await this.makeApiRequest('/recommendations/available-genre-seeds')
      
      const genres: Genre[] = response.data.genres.map((genre: string) => ({
        name: genre,
        displayName: this.formatGenreName(genre),
        relatedGenres: this.getRelatedGenres(genre)
      }))

      // Cache for 6 hours
      await this.cache.set(cacheKey, genres, 21600)
      
      return genres

    } catch (error: any) {
      throw this.handleApiError(error, 'Failed to fetch available genres')
    }
  }

  /**
   * Validate genres using N8N workflow
   */
  private async validateGenres(genres: string[]) {
    try {
      const response = await $fetch(`${this.config.n8nWebhookUrl}/validate-genres`, {
        method: 'POST',
        headers: {
          'X-API-Key': this.config.n8nApiKey,
          'Content-Type': 'application/json'
        },
        body: { genres }
      })

      return response
    } catch (error: any) {
      console.warn('Genre validation via N8N failed, using local validation:', error.message)
      
      // Fallback to local validation
      const availableGenres = await this.getAvailableGenres()
      const availableGenreNames = availableGenres.map(g => g.name)
      
      const validGenres = genres.filter(g => availableGenreNames.includes(g.toLowerCase()))
      const invalidGenres = genres.filter(g => !availableGenreNames.includes(g.toLowerCase()))
      
      return {
        validGenres,
        invalidGenres: invalidGenres.map(g => ({ requested: g, suggestions: [] })),
        validCount: validGenres.length,
        invalidCount: invalidGenres.length
      }
    }
  }

  /**
   * Execute the actual playlist search with pagination
   */
  private async executePlaylistSearch(request: SearchRequest, requestId: string) {
    const playlists: Playlist[] = []
    const warnings: string[] = []
    let apiCallsCount = 0
    
    // Build search query
    const genreQueries = request.genres.map(genre => `genre:"${genre}"`).join(' OR ')
    const searchQuery = `(${genreQueries}) type:playlist`
    
    let offset = 0
    const limit = 50
    const maxResults = 1000 // Spotify limit
    
    while (playlists.length < maxResults && offset < maxResults) {
      await this.ensureValidToken()
      await this.rateLimiter.waitForSlot()
      
      try {
        const response = await this.makeApiRequest('/search', {
          q: searchQuery,
          type: 'playlist',
          limit: limit,
          offset: offset,
          market: request.market || 'US'
        })
        
        apiCallsCount++
        
        const items = response.data.playlists?.items || []
        if (items.length === 0) break
        
        // Process and filter playlists
        for (const item of items) {
          try {
            const playlist = await this.transformAndValidatePlaylist(item, request)
            if (playlist) {
              playlists.push(playlist)
            }
          } catch (error: any) {
            warnings.push(`Failed to process playlist ${item.id}: ${error.message}`)
          }
        }
        
        // If we got fewer than requested, we've reached the end
        if (items.length < limit) break
        
        offset += limit
        
        // Rate limiting protection
        await new Promise(resolve => setTimeout(resolve, 100))
        
      } catch (error: any) {
        if (error.details?.status === 429) {
          // Rate limited, wait and retry
          const retryAfter = error.details.retryAfter || 1000
          await new Promise(resolve => setTimeout(resolve, retryAfter))
          continue
        }
        throw error
      }
    }
    
    return {
      playlists,
      apiCallsCount,
      warnings
    }
  }

  /**
   * Transform Spotify API playlist response to our Playlist type
   */
  private async transformAndValidatePlaylist(item: any, request: SearchRequest): Promise<Playlist | null> {
    // Apply filters
    if (request.minFollowers && (item.followers?.total || 0) < request.minFollowers) {
      return null
    }
    
    if (request.maxFollowers && (item.followers?.total || 0) > request.maxFollowers) {
      return null
    }
    
    // Get detailed playlist info if needed
    let detailedPlaylist = item
    if (!item.tracks || !item.owner?.followers) {
      try {
        detailedPlaylist = await this.getPlaylistDetails(item.id)
      } catch (error) {
        console.warn(`Failed to get detailed info for playlist ${item.id}:`, error)
      }
    }
    
    return this.transformPlaylistResponse(detailedPlaylist)
  }

  /**
   * Transform Spotify playlist data to our Playlist interface
   */
  private transformPlaylistResponse(data: any): Playlist {
    const owner: PlaylistOwner = {
      id: data.owner.id,
      displayName: data.owner.display_name || 'Unknown',
      profileUrl: data.owner.external_urls?.spotify || '',
      imageUrl: data.owner.images?.[0]?.url || null,
      followerCount: data.owner.followers?.total || 0,
      contactInfo: {
        username: data.owner.id,
        profileUrl: data.owner.external_urls?.spotify || '',
        isContactPublic: true,
        socialLinks: [],
        contactStatus: 'public' as const
      }
    }

    return {
      id: data.id,
      name: data.name,
      description: data.description || null,
      url: data.external_urls?.spotify || '',
      externalUrl: `spotify:playlist:${data.id}`,
      imageUrl: data.images?.[0]?.url || null,
      followerCount: data.followers?.total || 0,
      trackCount: data.tracks?.total || 0,
      owner,
      genres: this.extractGenresFromPlaylist(data),
      popularity: this.calculatePopularityScore(data),
      lastUpdated: data.snapshot_id ? new Date().toISOString() : new Date().toISOString(),
      isPublic: data.public !== false
    }
  }

  /**
   * Extract genres from playlist data (heuristic approach)
   */
  private extractGenresFromPlaylist(data: any): string[] {
    const genres: string[] = []
    
    // Extract from description
    if (data.description) {
      const description = data.description.toLowerCase()
      const commonGenres = ['pop', 'rock', 'hip-hop', 'jazz', 'classical', 'electronic', 'country', 'r&b', 'indie', 'folk']
      for (const genre of commonGenres) {
        if (description.includes(genre)) {
          genres.push(genre)
        }
      }
    }
    
    // Extract from name
    if (data.name) {
      const name = data.name.toLowerCase()
      const commonGenres = ['pop', 'rock', 'hip-hop', 'jazz', 'classical', 'electronic', 'country', 'r&b', 'indie', 'folk']
      for (const genre of commonGenres) {
        if (name.includes(genre)) {
          genres.push(genre)
        }
      }
    }
    
    return [...new Set(genres)] // Remove duplicates
  }

  /**
   * Calculate popularity score based on multiple factors
   */
  private calculatePopularityScore(data: any): number {
    const followers = data.followers?.total || 0
    const tracks = data.tracks?.total || 0
    
    // Logarithmic scale for followers + track count factor
    const followerScore = followers > 0 ? Math.log10(followers + 1) * 20 : 0
    const trackScore = Math.min(tracks / 50, 1) * 10 // Max 10 points for track count
    
    return Math.min(Math.round(followerScore + trackScore), 100)
  }

  /**
   * Get detailed playlist information
   */
  private async getPlaylistDetails(playlistId: string): Promise<any> {
    const response = await this.makeApiRequest(`/playlists/${playlistId}`, {
      fields: 'id,name,description,external_urls,images,followers,tracks(total),owner(id,display_name,external_urls,followers),public,snapshot_id'
    })
    return response.data
  }

  /**
   * Enhance playlists with scraped data via N8N/Apify
   */
  private async enhancePlaylistsWithScraping(playlists: Playlist[]): Promise<Playlist[]> {
    if (playlists.length === 0) return playlists
    
    try {
      const playlistIds = playlists.map(p => p.id)
      const response = await $fetch(`${this.config.n8nWebhookUrl}/enhance-playlists`, {
        method: 'POST',
        headers: {
          'X-API-Key': this.config.n8nApiKey,
          'Content-Type': 'application/json'
        },
        body: {
          playlistIds: playlistIds.slice(0, 50), // Limit to 50 for performance
          options: {
            maxConcurrency: 3,
            includeOwnerProfile: true,
            includeTrackSample: true
          }
        }
      })

      if (response.success && response.enhancedPlaylists) {
        return this.mergeScrapedData(playlists, response.enhancedPlaylists)
      }
      
      return playlists
      
    } catch (error: any) {
      console.warn('Playlist enhancement failed, returning original data:', error.message)
      return playlists
    }
  }

  /**
   * Merge scraped data with API data
   */
  private mergeScrapedData(apiPlaylists: Playlist[], scrapedData: any[]): Playlist[] {
    const scrapedMap = new Map(scrapedData.map(item => [item.id, item.scrapedData]))
    
    return apiPlaylists.map(playlist => {
      const scraped = scrapedMap.get(playlist.id)
      if (!scraped) return playlist
      
      return {
        ...playlist,
        // Override with more accurate scraped data where available
        followerCount: scraped.followerCount || playlist.followerCount,
        trackCount: scraped.trackCount || playlist.trackCount,
        description: scraped.description || playlist.description,
        lastUpdated: scraped.lastUpdated || playlist.lastUpdated,
        owner: {
          ...playlist.owner,
          ...(scraped.owner?.profile && {
            displayName: scraped.owner.profile.displayName || playlist.owner.displayName,
            followerCount: scraped.owner.profile.followerCount || playlist.owner.followerCount,
            imageUrl: scraped.owner.profile.profileImageUrl || playlist.owner.imageUrl
          })
        }
      }
    })
  }

  /**
   * Ensure we have a valid access token
   */
  private async ensureValidToken(): Promise<void> {
    if (this.accessToken && Date.now() < this.tokenExpiresAt) {
      return // Token is still valid
    }

    try {
      // Try to get token from N8N workflow first
      const tokenResponse = await $fetch(`${this.config.n8nWebhookUrl}/spotify-token`, {
        headers: {
          'X-API-Key': this.config.n8nApiKey
        }
      })

      if (tokenResponse.access_token) {
        this.accessToken = tokenResponse.access_token
        this.tokenExpiresAt = Date.now() + (tokenResponse.expires_in || 3600) * 1000
        return
      }
    } catch (error) {
      console.warn('Failed to get token from N8N, falling back to direct OAuth:', error)
    }

    // Fallback to direct token request
    await this.requestAccessToken()
  }

  /**
   * Request access token directly from Spotify
   */
  private async requestAccessToken(): Promise<void> {
    const credentials = Buffer.from(`${this.config.clientId}:${this.config.clientSecret}`).toString('base64')
    
    try {
      const response = await $fetch('https://accounts.spotify.com/api/token', {
        method: 'POST',
        headers: {
          'Authorization': `Basic ${credentials}`,
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: 'grant_type=client_credentials'
      })

      this.accessToken = response.access_token
      this.tokenExpiresAt = Date.now() + response.expires_in * 1000

    } catch (error: any) {
      throw new SpotifyApiError(
        'Failed to obtain access token',
        {
          status: error.status || 500,
          message: error.message || 'Token request failed'
        }
      )
    }
  }

  /**
   * Make authenticated API request to Spotify
   */
  private async makeApiRequest(endpoint: string, params?: Record<string, any>): Promise<SpotifyApiResponse> {
    if (!this.accessToken) {
      throw new SpotifyApiError('No access token available', { status: 401, message: 'Unauthorized' })
    }

    const url = new URL(`https://api.spotify.com/v1${endpoint}`)
    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
          url.searchParams.append(key, String(value))
        }
      })
    }

    const requestId = Math.random().toString(36).substr(2, 9)
    
    try {
      const response = await $fetch(url.toString(), {
        headers: {
          'Authorization': `Bearer ${this.accessToken}`,
          'Content-Type': 'application/json'
        }
      })

      return {
        data: response,
        cached: false,
        rateLimit: {
          remaining: 100, // Would extract from headers in real implementation
          resetTime: Date.now() + 60000
        },
        requestId
      }

    } catch (error: any) {
      throw this.handleApiError(error, `API request failed: ${endpoint}`)
    }
  }

  /**
   * Handle API errors with intelligent classification
   */
  private handleApiError(error: any, context: string): SpotifyApiError {
    const status = error.status || error.response?.status || 500
    const message = error.message || error.response?.statusText || 'Unknown error'
    
    let retryable = false
    let retryAfter: number | undefined
    
    switch (status) {
      case 401:
        // Token expired, retryable after refresh
        retryable = true
        this.accessToken = null
        this.tokenExpiresAt = 0
        break
      case 429:
        // Rate limited
        retryable = true
        retryAfter = parseInt(error.response?.headers?.['retry-after']) * 1000 || 1000
        break
      case 500:
      case 502:
      case 503:
        // Server errors, retryable
        retryable = true
        break
    }
    
    return new SpotifyApiError(
      `${context}: ${message}`,
      {
        status,
        message,
        code: error.code,
        retryAfter
      },
      retryable
    )
  }

  /**
   * Validation methods
   */
  private async validateSearchRequest(request: SearchRequest): Promise<void> {
    if (!request.genres || request.genres.length === 0) {
      throw new SpotifyApiError('At least one genre is required', { status: 400, message: 'Missing genres' })
    }
    
    if (request.genres.length > 10) {
      throw new SpotifyApiError('Maximum 10 genres allowed', { status: 400, message: 'Too many genres' })
    }
    
    if (request.minFollowers && request.minFollowers < 0) {
      throw new SpotifyApiError('Minimum followers cannot be negative', { status: 400, message: 'Invalid minFollowers' })
    }
  }

  private validatePlaylistId(playlistId: string): void {
    if (!playlistId || typeof playlistId !== 'string' || playlistId.length !== 22) {
      throw new SpotifyApiError('Invalid playlist ID format', { status: 400, message: 'Invalid playlist ID' })
    }
  }

  /**
   * Utility methods
   */
  private generateCacheKey(operation: string, params: any): string {
    const hash = Buffer.from(JSON.stringify(params)).toString('base64')
    return `spotify_${operation}_${hash}`
  }

  private formatGenreName(genre: string): string {
    return genre.split('-').map(word => 
      word.charAt(0).toUpperCase() + word.slice(1)
    ).join(' ')
  }

  private getRelatedGenres(genre: string): string[] {
    const genreMap: Record<string, string[]> = {
      'pop': ['dance-pop', 'electropop', 'indie-pop'],
      'rock': ['alt-rock', 'indie-rock', 'classic-rock'],
      'electronic': ['techno', 'house', 'ambient'],
      'hip-hop': ['rap', 'trap', 'old-school'],
      'jazz': ['smooth-jazz', 'bebop', 'fusion'],
      // Add more mappings as needed
    }
    
    return genreMap[genre] || []
  }
}

/**
 * Rate Limiter Implementation
 */
class RateLimiter {
  private requests: number[] = []
  private config: { requestsPerMinute: number; burstLimit: number }

  constructor(config: { requestsPerMinute: number; burstLimit: number }) {
    this.config = config
  }

  async waitForSlot(): Promise<void> {
    const now = Date.now()
    const oneMinuteAgo = now - 60000
    
    // Clean old requests
    this.requests = this.requests.filter(time => time > oneMinuteAgo)
    
    // Check if we're at the limit
    if (this.requests.length >= this.config.requestsPerMinute) {
      const oldestRequest = Math.min(...this.requests)
      const waitTime = 60000 - (now - oldestRequest) + 100 // Add small buffer
      
      if (waitTime > 0) {
        await new Promise(resolve => setTimeout(resolve, waitTime))
        return this.waitForSlot() // Recursive call after waiting
      }
    }
    
    // Check burst limit
    const lastSecond = now - 1000
    const recentRequests = this.requests.filter(time => time > lastSecond)
    
    if (recentRequests.length >= this.config.burstLimit) {
      await new Promise(resolve => setTimeout(resolve, 1100))
      return this.waitForSlot()
    }
    
    // Add this request to the list
    this.requests.push(now)
  }
}

/**
 * Cache Manager Implementation
 */
class CacheManager {
  private cache = new Map<string, { data: any; expiresAt: number }>()
  private config: { tokenTtl: number; responseTtl: number }

  constructor(config: { tokenTtl: number; responseTtl: number }) {
    this.config = config
    
    // Clean expired entries every 5 minutes
    setInterval(() => this.cleanup(), 5 * 60 * 1000)
  }

  async get<T>(key: string): Promise<T | null> {
    const entry = this.cache.get(key)
    if (!entry) return null
    
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key)
      return null
    }
    
    return entry.data as T
  }

  async set<T>(key: string, data: T, ttl: number): Promise<void> {
    this.cache.set(key, {
      data,
      expiresAt: Date.now() + ttl * 1000
    })
  }

  private cleanup(): void {
    const now = Date.now()
    for (const [key, entry] of this.cache.entries()) {
      if (now > entry.expiresAt) {
        this.cache.delete(key)
      }
    }
  }
}

/**
 * Factory function to create configured Spotify client
 */
export function createSpotifyClient(): SpotifyClient {
  const config = useRuntimeConfig()
  
  return new SpotifyClient({
    clientId: config.spotifyClientId,
    clientSecret: config.spotifyClientSecret,
    n8nWebhookUrl: config.n8nWebhookUrl,
    n8nApiKey: config.n8nApiKey,
    rateLimit: {
      requestsPerMinute: 180,
      burstLimit: 10
    },
    cache: {
      tokenTtl: 3600,
      responseTtl: 900
    },
    retry: {
      maxRetries: 3,
      baseDelay: 1000,
      maxDelay: 8000
    }
  })
}