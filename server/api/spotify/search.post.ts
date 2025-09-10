/**
 * POST /api/spotify/search
 * 
 * Search for Spotify playlists by genres with optional filtering.
 * Returns exactly 50 playlists with owner contact information.
 * 
 * Reference: api-contract.yaml lines 59-83
 */

import { createSpotifyClient } from '~/lib/spotify-client'
import { useCache, CacheKeys } from '~/lib/cache-manager'
import { useRateLimiter, createRateLimitMiddleware } from '~/lib/rate-limiter'
import { useErrorHandler, createErrorContext } from '~/lib/error-utils'
import { useValidator, SpotifySchemas, createValidationMiddleware } from '~/lib/validation-utils'
import type { SearchRequest, SearchResult } from '~/types'

const rateLimiter = useRateLimiter()
const validator = useValidator()

// Rate limiting middleware for search (more restrictive due to expensive operations)
const rateLimit = createRateLimitMiddleware(rateLimiter, 'search', {
  keyExtractor: (event) => ({
    key: 'search-endpoint',
    ip: getClientIP(event),
    userId: getHeader(event, 'x-user-id') || 'anonymous',
    endpoint: '/api/spotify/search',
    method: 'POST',
    timestamp: Date.now()
  })
})

// Validation middleware
const validateRequest = createValidationMiddleware(SpotifySchemas.searchRequest, {
  validateBody: true,
  sanitize: true
})

export default defineEventHandler(async (event) => {
  const startTime = Date.now()
  const requestId = `search_${startTime}_${Math.random().toString(36).substr(2, 9)}`
  
  // Set request headers
  setHeader(event, 'X-Request-ID', requestId)
  setHeader(event, 'Content-Type', 'application/json')
  
  try {
    // Read and validate request body
    const body = await readBody(event)
    
    // Apply validation
    await validateRequest(event)
    
    // Apply rate limiting
    await rateLimit(event)
    
    const cache = useCache()
    const errorHandler = useErrorHandler()
    
    // Sanitize and validate search request
    const searchRequest: SearchRequest = {
      genres: body.genres || [],
      minFollowers: body.minFollowers || 0,
      maxFollowers: body.maxFollowers,
      market: body.market || 'US',
      enhanceWithScraping: body.enhanceWithScraping || false
    }
    
    // Additional business logic validation
    if (searchRequest.genres.length === 0) {
      throw createError({
        statusCode: 400,
        statusMessage: 'Bad Request',
        data: {
          success: false,
          error: {
            code: 'MISSING_GENRES',
            message: 'At least one genre is required',
            field: 'genres'
          },
          requestId
        }
      })
    }
    
    if (searchRequest.minFollowers && searchRequest.maxFollowers && 
        searchRequest.minFollowers > searchRequest.maxFollowers) {
      throw createError({
        statusCode: 400,
        statusMessage: 'Bad Request',
        data: {
          success: false,
          error: {
            code: 'INVALID_FOLLOWER_RANGE',
            message: 'minFollowers cannot be greater than maxFollowers'
          },
          requestId
        }
      })
    }
    
    // Check cache first
    const cacheKey = CacheKeys.search(searchRequest.genres, searchRequest.minFollowers)
    const cached = await cache.get<SearchResult>(cacheKey)
    
    if (cached && !searchRequest.enhanceWithScraping) {
      setHeader(event, 'X-Cache-Status', 'HIT')
      setHeader(event, 'X-Response-Time', `${Date.now() - startTime}ms`)
      
      // Update metadata with current request info
      const result: SearchResult = {
        ...cached,
        requestId,
        searchMetadata: {
          ...cached.searchMetadata,
          cacheHit: true,
          requestId,
          executionTime: Date.now() - startTime
        }
      }
      
      return {
        success: true,
        data: result,
        metadata: {
          totalPlaylists: result.playlists.length,
          executionTime: Date.now() - startTime,
          cached: true,
          requestId
        }
      }
    }
    
    // Create Spotify client and perform search
    const spotifyClient = createSpotifyClient()
    await spotifyClient.initialize()
    
    // Execute search
    const searchResult = await spotifyClient.searchPlaylists(searchRequest)
    
    // Ensure we return exactly 50 playlists
    if (searchResult.playlists.length > 50) {
      searchResult.playlists = searchResult.playlists.slice(0, 50)
      searchResult.totalFound = Math.min(searchResult.totalFound, 50)
    }
    
    // Add padding if we have fewer than 50 playlists
    if (searchResult.playlists.length < 50) {
      const paddingResult = await this.addPaddingPlaylists(
        searchResult,
        searchRequest,
        spotifyClient
      )
      if (paddingResult) {
        searchResult.playlists.push(...paddingResult.playlists)
        searchResult.totalFound += paddingResult.playlists.length
        searchResult.searchMetadata.warnings?.push(
          `Added ${paddingResult.playlists.length} related playlists to reach 50 results`
        )
      }
    }
    
    // Final trim to exactly 50
    searchResult.playlists = searchResult.playlists.slice(0, 50)
    searchResult.totalFound = Math.min(searchResult.totalFound, 50)
    
    // Cache the results (15 minutes TTL)
    if (!searchRequest.enhanceWithScraping) {
      await cache.set(cacheKey, searchResult, 900, ['spotify', 'search', ...searchRequest.genres])
    }
    
    setHeader(event, 'X-Cache-Status', 'MISS')
    setHeader(event, 'X-Response-Time', `${Date.now() - startTime}ms`)
    
    return {
      success: true,
      data: searchResult,
      metadata: {
        totalPlaylists: searchResult.playlists.length,
        executionTime: searchResult.searchMetadata.executionTime,
        cached: false,
        requestId,
        enhanced: searchRequest.enhanceWithScraping
      }
    }
    
  } catch (error: any) {
    // Handle validation errors
    if (error.statusCode === 400 && error.data?.code === 'VALIDATION_FAILED') {
      setHeader(event, 'X-Response-Time', `${Date.now() - startTime}ms`)
      throw error
    }
    
    const context = createErrorContext('search-playlists', {
      requestId,
      endpoint: '/api/spotify/search',
      method: 'POST',
      ip: getClientIP(event),
      userAgent: getHeader(event, 'user-agent'),
      metadata: { searchRequest: body }
    })
    
    const errorHandler = useErrorHandler()
    const result = await errorHandler.handleError(error, context)
    
    if (result.recovered && result.result) {
      // Return recovered data if available
      setHeader(event, 'X-Recovery-Status', 'SUCCESS')
      setHeader(event, 'X-Response-Time', `${Date.now() - startTime}ms`)
      
      return {
        success: true,
        data: result.result,
        metadata: {
          totalPlaylists: result.result.playlists?.length || 0,
          executionTime: Date.now() - startTime,
          cached: true,
          requestId,
          recovered: true
        }
      }
    }
    
    // Handle different error types
    const finalError = result.finalError
    let statusCode = 500
    let errorResponse: any = {
      success: false,
      error: {
        code: finalError.details.code,
        message: finalError.details.userMessage,
        requestId
      },
      metadata: {
        executionTime: Date.now() - startTime,
        requestId
      }
    }
    
    switch (finalError.details.category) {
      case 'validation':
        statusCode = 400
        errorResponse.error.retryable = false
        errorResponse.error.suggestions = finalError.details.suggestedActions
        break
        
      case 'auth':
        statusCode = 401
        errorResponse.error.retryable = true
        errorResponse.error.suggestion = 'Service authentication issue. Please try again in a moment.'
        break
        
      case 'rate_limit':
        statusCode = 429
        errorResponse.error.retryable = true
        errorResponse.error.retryAfter = finalError.details.metadata?.retryAfter || 60
        setHeader(event, 'Retry-After', errorResponse.error.retryAfter.toString())
        break
        
      case 'business':
        statusCode = 422
        errorResponse.error.retryable = false
        errorResponse.error.suggestion = 'Please modify your search criteria and try again.'
        break
        
      case 'network':
      case 'api':
        statusCode = 503
        errorResponse.error.retryable = true
        errorResponse.error.suggestion = 'Spotify service is temporarily unavailable. Please try again later.'
        break
        
      default:
        statusCode = 500
        errorResponse.error.retryable = false
        errorResponse.error.suggestion = 'An unexpected error occurred. Please try again or contact support.'
    }
    
    setHeader(event, 'X-Response-Time', `${Date.now() - startTime}ms`)
    
    throw createError({
      statusCode,
      statusMessage: finalError.details.userMessage,
      data: errorResponse
    })
  }
})

/**
 * Add padding playlists when we have fewer than 50 results
 */
async function addPaddingPlaylists(
  searchResult: SearchResult,
  searchRequest: SearchRequest,
  spotifyClient: any
): Promise<{ playlists: any[] } | null> {
  try {
    const needed = 50 - searchResult.playlists.length
    if (needed <= 0) return null
    
    // Get related genres for padding
    const relatedGenres = await getRelatedGenres(searchRequest.genres)
    
    if (relatedGenres.length === 0) return null
    
    // Search with related genres
    const paddingRequest: SearchRequest = {
      ...searchRequest,
      genres: relatedGenres.slice(0, 3), // Limit to 3 related genres
      minFollowers: Math.max(0, (searchRequest.minFollowers || 0) - 10000) // Lower threshold
    }
    
    const paddingResult = await spotifyClient.searchPlaylists(paddingRequest)
    
    // Filter out duplicates and take only what we need
    const existingIds = new Set(searchResult.playlists.map(p => p.id))
    const uniquePaddingPlaylists = paddingResult.playlists
      .filter((p: any) => !existingIds.has(p.id))
      .slice(0, needed)
    
    return {
      playlists: uniquePaddingPlaylists
    }
    
  } catch (error) {
    console.warn('Failed to add padding playlists:', error)
    return null
  }
}

/**
 * Get related genres for padding search results
 */
async function getRelatedGenres(originalGenres: string[]): Promise<string[]> {
  // Simple genre relationship mapping
  const genreMap: Record<string, string[]> = {
    'pop': ['dance-pop', 'electropop', 'indie-pop', 'synth-pop'],
    'rock': ['alt-rock', 'indie-rock', 'classic-rock', 'pop-rock'],
    'hip-hop': ['rap', 'trap', 'hip-house', 'conscious-hip-hop'],
    'electronic': ['techno', 'house', 'ambient', 'edm'],
    'jazz': ['smooth-jazz', 'bebop', 'jazz-fusion', 'vocal-jazz'],
    'r-n-b': ['neo-soul', 'contemporary-r-n-b', 'funk'],
    'country': ['country-rock', 'bluegrass', 'americana'],
    'folk': ['indie-folk', 'singer-songwriter', 'acoustic'],
    'metal': ['heavy-metal', 'death-metal', 'black-metal'],
    'reggae': ['dancehall', 'dub', 'reggaeton']
  }
  
  const relatedGenres = new Set<string>()
  
  for (const genre of originalGenres) {
    const related = genreMap[genre.toLowerCase()]
    if (related) {
      related.forEach(g => relatedGenres.add(g))
    }
  }
  
  // Remove original genres from related list
  originalGenres.forEach(g => relatedGenres.delete(g.toLowerCase()))
  
  return Array.from(relatedGenres)
}