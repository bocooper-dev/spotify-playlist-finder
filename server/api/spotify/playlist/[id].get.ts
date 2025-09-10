/**
 * GET /api/spotify/playlist/:id
 *
 * Get detailed information about a specific Spotify playlist.
 * Returns playlist details with owner contact information.
 *
 * Reference: api-contract.yaml lines 110-136
 */

import { CacheKeys, useCache } from '../../../.././lib/cache-manager'
import { createErrorContext, useErrorHandler } from '../../../.././lib/error-utils'
import { createRateLimitMiddleware, useRateLimiter } from '../../../.././lib/rate-limiter'
import { createSpotifyClient } from '../../../.././lib/spotify-client'
import { SpotifySchemas, createValidationMiddleware, useValidator } from '../../../.././lib/validation-utils'
import type { Playlist } from '../../../.././types'

const rateLimiter = useRateLimiter()
const validator = useValidator()

// Rate limiting middleware
const rateLimit = createRateLimitMiddleware(rateLimiter, 'api', {
  keyExtractor: event => ({
    key: 'playlist-endpoint',
    ip: getClientIP(event),
    userId: getHeader(event, 'x-user-id') || 'anonymous',
    endpoint: `/api/spotify/playlist/${getRouterParam(event, 'id')}`,
    method: 'GET',
    timestamp: Date.now()
  })
})

// Validation middleware for playlist ID
const validateParams = createValidationMiddleware(SpotifySchemas.playlistId, {
  validateParams: true,
  sanitize: true
})

export default defineEventHandler(async (event) => {
  const startTime = Date.now()
  const playlistId = getRouterParam(event, 'id')
  const requestId = `playlist_${playlistId}_${startTime}_${Math.random().toString(36).substr(2, 9)}`

  // Set request headers
  setHeader(event, 'X-Request-ID', requestId)
  setHeader(event, 'Content-Type', 'application/json')

  try {
    // Validate playlist ID format
    if (!playlistId || typeof playlistId !== 'string') {
      throw createError({
        statusCode: 400,
        statusMessage: 'Bad Request',
        data: {
          success: false,
          error: {
            code: 'INVALID_PLAYLIST_ID',
            message: 'Playlist ID is required and must be a valid string',
            field: 'id'
          },
          requestId
        }
      })
    }

    // Validate playlist ID format (22 characters, alphanumeric)
    if (!/^[0-9A-Za-z]{22}$/.test(playlistId)) {
      throw createError({
        statusCode: 400,
        statusMessage: 'Bad Request',
        data: {
          success: false,
          error: {
            code: 'INVALID_PLAYLIST_ID_FORMAT',
            message: 'Playlist ID must be exactly 22 alphanumeric characters',
            field: 'id',
            value: playlistId
          },
          requestId
        }
      })
    }

    // Apply rate limiting
    await rateLimit(event)

    const cache = useCache()
    const errorHandler = useErrorHandler()

    // Check cache first
    const cacheKey = CacheKeys.playlist(playlistId)
    const cached = await cache.get<Playlist>(cacheKey)

    if (cached) {
      setHeader(event, 'X-Cache-Status', 'HIT')
      setHeader(event, 'X-Response-Time', `${Date.now() - startTime}ms`)

      return {
        success: true,
        data: cached,
        metadata: {
          cached: true,
          responseTime: Date.now() - startTime,
          requestId,
          source: 'cache'
        }
      }
    }

    // Create Spotify client and fetch playlist
    const spotifyClient = createSpotifyClient()
    await spotifyClient.initialize()

    // Get playlist details
    const playlist = await spotifyClient.getPlaylist(playlistId)

    // Validate that we got a valid playlist
    if (!playlist) {
      throw createError({
        statusCode: 404,
        statusMessage: 'Not Found',
        data: {
          success: false,
          error: {
            code: 'PLAYLIST_NOT_FOUND',
            message: 'The requested playlist could not be found',
            requestId
          },
          metadata: {
            responseTime: Date.now() - startTime,
            requestId
          }
        }
      })
    }

    // Check if playlist is public and accessible
    if (!playlist.isPublic) {
      throw createError({
        statusCode: 403,
        statusMessage: 'Forbidden',
        data: {
          success: false,
          error: {
            code: 'PLAYLIST_PRIVATE',
            message: 'This playlist is private and cannot be accessed',
            requestId
          },
          metadata: {
            responseTime: Date.now() - startTime,
            requestId
          }
        }
      })
    }

    // Enhance playlist with additional metadata
    const enhancedPlaylist = {
      ...playlist,
      // Add computed fields
      popularity: playlist.popularity || calculatePopularityScore(playlist),
      lastFetched: new Date().toISOString(),
      // Ensure owner contact information is properly formatted
      owner: {
        ...playlist.owner,
        contactInfo: {
          ...playlist.owner.contactInfo,
          isContactPublic: playlist.owner.contactInfo?.isContactPublic !== false,
          contactStatus: playlist.owner.contactInfo?.contactStatus || 'public' as const
        }
      }
    }

    // Cache the results (30 minutes TTL for playlist details)
    await cache.set(cacheKey, enhancedPlaylist, 1800, ['spotify', 'playlist', playlistId])

    setHeader(event, 'X-Cache-Status', 'MISS')
    setHeader(event, 'X-Response-Time', `${Date.now() - startTime}ms`)

    return {
      success: true,
      data: enhancedPlaylist,
      metadata: {
        cached: false,
        responseTime: Date.now() - startTime,
        requestId,
        source: 'spotify-api',
        lastFetched: enhancedPlaylist.lastFetched
      }
    }
  } catch (error: any) {
    // Handle known client errors
    if (error.statusCode && error.statusCode < 500) {
      setHeader(event, 'X-Response-Time', `${Date.now() - startTime}ms`)
      throw error
    }

    const context = createErrorContext('get-playlist', {
      requestId,
      endpoint: `/api/spotify/playlist/${playlistId}`,
      method: 'GET',
      ip: getClientIP(event),
      userAgent: getHeader(event, 'user-agent'),
      metadata: { playlistId }
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
          cached: true,
          responseTime: Date.now() - startTime,
          requestId,
          source: 'recovery-cache',
          recovered: true
        }
      }
    }

    // Handle different error types
    const finalError = result.finalError
    let statusCode = 500
    const errorResponse: any = {
      success: false,
      error: {
        code: finalError.details.code,
        message: finalError.details.userMessage,
        requestId
      },
      metadata: {
        responseTime: Date.now() - startTime,
        requestId
      }
    }

    switch (finalError.details.category) {
      case 'validation':
        statusCode = 400
        errorResponse.error.retryable = false
        errorResponse.error.field = finalError.details.metadata?.field || 'id'
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
        // Check if it's a "not found" case
        if (finalError.message.includes('not found') || finalError.message.includes('404')) {
          statusCode = 404
          errorResponse.error.code = 'PLAYLIST_NOT_FOUND'
          errorResponse.error.message = 'The requested playlist could not be found'
        } else if (finalError.message.includes('private') || finalError.message.includes('403')) {
          statusCode = 403
          errorResponse.error.code = 'PLAYLIST_PRIVATE'
          errorResponse.error.message = 'This playlist is private and cannot be accessed'
        } else {
          statusCode = 422
        }
        errorResponse.error.retryable = false
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
 * Calculate popularity score for playlist
 */
function calculatePopularityScore(playlist: Playlist): number {
  const followers = playlist.followerCount || 0
  const tracks = playlist.trackCount || 0

  // Logarithmic scale for followers + track count factor
  const followerScore = followers > 0 ? Math.log10(followers + 1) * 20 : 0
  const trackScore = Math.min(tracks / 50, 1) * 10 // Max 10 points for track count

  return Math.min(Math.round(followerScore + trackScore), 100)
}
