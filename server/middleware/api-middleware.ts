/**
 * Global API Middleware
 *
 * Provides common functionality across all API endpoints:
 * - Request/response logging
 * - Security headers
 * - CORS handling
 * - Request validation
 * - Performance monitoring
 */

import { createErrorContext, useErrorHandler } from '../.././lib/_error-utils'

export default defineEventHandler(async (event) => {
  // Only apply to API routes
  if (!event.node.req.url?.startsWith('/api/')) {
    return
  }

  const startTime = Date.now()
  const requestId = Math.random().toString(36).substring(2, 15)

  try {
    // Set common headers
    setHeaders(event, {
      'X-Request-ID': requestId,
      'X-API-Version': '1.0',
      'X-Powered-By': 'Nuxt 4 + Claude Code',
      // Security headers
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
      'X-XSS-Protection': '1; mode=block',
      'Referrer-Policy': 'strict-origin-when-cross-origin'
    })

    // CORS handling
    const origin = getHeader(event, 'origin')
    const allowedOrigins = [
      process.env.NUXT_PUBLIC_APP_URL,
      'https://localhost:3000',
      'http://localhost:3000',
      'https://127.0.0.1:3000'
    ].filter(Boolean)

    if (origin && allowedOrigins.includes(origin)) {
      setHeaders(event, {
        'Access-Control-Allow-Origin': origin,
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-API-Key, X-User-ID',
        'Access-Control-Max-Age': '86400',
        'Access-Control-Allow-Credentials': 'true'
      })
    }

    // Handle preflight requests
    if (event.node.req.method === 'OPTIONS') {
      setResponseStatus(event, 200)
      return ''
    }

    // Request size validation
    const contentLength = getHeader(event, 'content-length')
    if (contentLength && parseInt(contentLength) > 10 * 1024 * 1024) { // 10MB limit
      throw createError({
        statusCode: 413,
        statusMessage: 'Payload Too Large',
        data: {
          success: false,
          _error: {
            code: 'PAYLOAD_TOO_LARGE',
            message: 'Request payload exceeds maximum size of 10MB'
          }
        }
      })
    }

    // Content-Type validation for POST requests
    if (event.node.req.method === 'POST') {
      const contentType = getHeader(event, 'content-type')
      if (!contentType?.includes('application/json')) {
        throw createError({
          statusCode: 400,
          statusMessage: 'Bad Request',
          data: {
            success: false,
            _error: {
              code: 'INVALID_CONTENT_TYPE',
              message: 'Content-Type must be application/json'
            }
          }
        })
      }
    }

    // Log request (in development)
    if (process.env.NODE_ENV === 'development') {
      console.log(`[API] ${event.node.req.method} ${event.node.req.url} - ${getClientIP(event)}`)
    }
  } catch (_error: unknown) {
    const context = createErrorContext('api-middleware', {
      requestId,
      endpoint: event.node.req.url || 'unknown',
      method: event.node.req.method || 'unknown',
      ip: getClientIP(event),
      userAgent: getHeader(event, 'user-agent')
    })

    const errorHandler = useErrorHandler()
    await errorHandler.handleError(_error, context)

    // Re-throw to let the route handler deal with it
    throw _error
  }

  // Performance monitoring hook
  event.context.startTime = startTime
  event.context.requestId = requestId
})
