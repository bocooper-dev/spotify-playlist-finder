/**
 * GET /api/spotify/genres
 * 
 * Returns available Spotify genres for playlist searching.
 * Implements caching, validation, and error handling.
 * 
 * Reference: api-contract.yaml lines 35-58
 */

import { createSpotifyClient } from '~/lib/spotify-client'
import { useCache, CacheKeys } from '~/lib/cache-manager'
import { useRateLimiter, createRateLimitMiddleware } from '~/lib/rate-limiter'
import { useErrorHandler, createErrorContext } from '~/lib/error-utils'
import type { Genre } from '~/types'

const rateLimiter = useRateLimiter()
const rateLimit = createRateLimitMiddleware(rateLimiter, 'api', {
  keyExtractor: (event) => ({
    key: 'genres-endpoint',
    ip: getClientIP(event),
    endpoint: '/api/spotify/genres',
    method: 'GET',
    timestamp: Date.now()
  })
})

export default defineEventHandler(async (event) => {
  const startTime = Date.now()
  const requestId = `genres_${startTime}_${Math.random().toString(36).substr(2, 9)}`
  
  // Set request headers
  setHeader(event, 'X-Request-ID', requestId)
  setHeader(event, 'Content-Type', 'application/json')
  
  try {
    // Apply rate limiting
    await rateLimit(event)
    
    const cache = useCache()
    const errorHandler = useErrorHandler()
    
    // Check cache first
    const cacheKey = CacheKeys.genres()
    const cached = await cache.get<Genre[]>(cacheKey)
    
    if (cached) {
      setHeader(event, 'X-Cache-Status', 'HIT')
      setHeader(event, 'X-Response-Time', `${Date.now() - startTime}ms`)
      
      return {
        success: true,
        data: cached,
        metadata: {
          totalGenres: cached.length,
          cached: true,
          responseTime: Date.now() - startTime,
          requestId
        }
      }
    }
    
    // Create Spotify client
    const spotifyClient = createSpotifyClient()
    await spotifyClient.initialize()
    
    // Get genres from Spotify API
    const genres = await spotifyClient.getAvailableGenres()
    
    // Cache the results (6 hours TTL)
    await cache.set(cacheKey, genres, 21600, ['spotify', 'genres'])
    
    setHeader(event, 'X-Cache-Status', 'MISS')
    setHeader(event, 'X-Response-Time', `${Date.now() - startTime}ms`)
    
    return {
      success: true,
      data: genres,
      metadata: {
        totalGenres: genres.length,
        cached: false,
        responseTime: Date.now() - startTime,
        requestId,
        source: 'spotify-api'
      }
    }
    
  } catch (error: any) {
    const context = createErrorContext('get-genres', {
      requestId,
      endpoint: '/api/spotify/genres',
      method: 'GET',
      ip: getClientIP(event),
      userAgent: getHeader(event, 'user-agent')
    })
    
    const result = await errorHandler.handleError(error, context)
    
    if (result.recovered && result.result) {
      // Return recovered data if available
      setHeader(event, 'X-Recovery-Status', 'SUCCESS')
      setHeader(event, 'X-Response-Time', `${Date.now() - startTime}ms`)
      
      return {
        success: true,
        data: result.result,
        metadata: {
          totalGenres: result.result.length || 0,
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
    let errorResponse: any = {
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
        
      case 'network':
      case 'api':
        statusCode = 503
        errorResponse.error.retryable = true
        errorResponse.error.suggestion = 'Spotify service is temporarily unavailable. Please try again later.'
        break
        
      default:
        statusCode = 500
        errorResponse.error.retryable = false
        errorResponse.error.suggestion = 'An unexpected error occurred. Please contact support if this continues.'
    }
    
    setHeader(event, 'X-Response-Time', `${Date.now() - startTime}ms`)
    
    throw createError({
      statusCode,
      statusMessage: finalError.details.userMessage,
      data: errorResponse
    })
  }
})