/**
 * Security Middleware
 *
 * Provides security features for API endpoints:
 * - Request sanitization
 * - IP-based blocking
 * - Suspicious activity detection
 * - Security headers enforcement
 */

import { BusinessLogicError, createErrorContext, useErrorHandler } from '../.././lib/error-utils'
import { useRateLimiter } from '../.././lib/rate-limiter'

interface SecurityConfig {
  maxRequestSize: number
  blockedIPs: string[]
  allowedUserAgents: RegExp[]
  suspiciousPatterns: RegExp[]
}

const securityConfig: SecurityConfig = {
  maxRequestSize: 10 * 1024 * 1024, // 10MB
  blockedIPs: [
    // Add known malicious IPs here
  ],
  allowedUserAgents: [
    // Allow legitimate browsers and tools
    /Mozilla/i,
    /Chrome/i,
    /Safari/i,
    /Firefox/i,
    /Edge/i,
    /curl/i,
    /Postman/i,
    /insomnia/i
  ],
  suspiciousPatterns: [
    // Common attack patterns
    /<script/i,
    /javascript:/i,
    /eval\(/i,
    /union.*select/i,
    /drop.*table/i,
    /\.\.\//,
    /%00/,
    /\\x00/
  ]
}

export default defineEventHandler(async (event) => {
  // Only apply to API routes
  if (!event.node.req.url?.startsWith('/api/')) {
    return
  }

  const requestId = event.context.requestId || 'unknown'
  const errorHandler = useErrorHandler()

  try {
    const ip = getClientIP(event)
    const userAgent = getHeader(event, 'user-agent') || ''
    const url = event.node.req.url || ''

    // IP-based blocking
    if (securityConfig.blockedIPs.includes(ip)) {
      console.warn(`[SECURITY] Blocked IP attempt: ${ip} to ${url}`)

      throw createError({
        statusCode: 403,
        statusMessage: 'Forbidden',
        data: {
          success: false,
          error: {
            code: 'IP_BLOCKED',
            message: 'Access denied from this IP address'
          }
        }
      })
    }

    // User-Agent validation
    if (userAgent && !securityConfig.allowedUserAgents.some(pattern => pattern.test(userAgent))) {
      console.warn(`[SECURITY] Suspicious User-Agent: ${userAgent} from ${ip}`)

      // Don't block immediately, but log for monitoring
      const context = createErrorContext('suspicious-user-agent', {
        requestId,
        endpoint: url,
        method: event.node.req.method || 'unknown',
        ip,
        userAgent,
        metadata: { userAgent, suspicious: true }
      })

      await errorHandler.handleError(
        new BusinessLogicError('Suspicious user agent detected', 'security-check'),
        context
      )
    }

    // URL pattern validation
    for (const pattern of securityConfig.suspiciousPatterns) {
      if (pattern.test(url)) {
        console.warn(`[SECURITY] Suspicious URL pattern detected: ${url} from ${ip}`)

        throw createError({
          statusCode: 400,
          statusMessage: 'Bad Request',
          data: {
            success: false,
            error: {
              code: 'SUSPICIOUS_REQUEST',
              message: 'Request contains suspicious content'
            }
          }
        })
      }
    }

    // Request body validation for POST requests
    if (event.node.req.method === 'POST') {
      try {
        const body = await readBody(event)

        if (body && typeof body === 'object') {
          // Check for suspicious patterns in request body
          const bodyString = JSON.stringify(body).toLowerCase()

          for (const pattern of securityConfig.suspiciousPatterns) {
            if (pattern.test(bodyString)) {
              console.warn(`[SECURITY] Suspicious content in request body from ${ip}`)

              throw createError({
                statusCode: 400,
                statusMessage: 'Bad Request',
                data: {
                  success: false,
                  error: {
                    code: 'SUSPICIOUS_CONTENT',
                    message: 'Request body contains suspicious content'
                  }
                }
              })
            }
          }

          // Validate request structure depth (prevent deeply nested objects)
          const maxDepth = 10
          if (getObjectDepth(body) > maxDepth) {
            throw createError({
              statusCode: 400,
              statusMessage: 'Bad Request',
              data: {
                success: false,
                error: {
                  code: 'REQUEST_TOO_COMPLEX',
                  message: 'Request structure is too complex'
                }
              }
            })
          }
        }
      } catch (error) {
        // If body parsing fails, it might be malicious
        if (error.message?.includes('JSON')) {
          throw createError({
            statusCode: 400,
            statusMessage: 'Bad Request',
            data: {
              success: false,
              error: {
                code: 'INVALID_JSON',
                message: 'Request body contains invalid JSON'
              }
            }
          })
        }
        throw error
      }
    }

    // Request frequency analysis (basic)
    const requestCount = await trackRequestFrequency(ip)
    if (requestCount > 1000) { // More than 1000 requests in tracking window
      console.warn(`[SECURITY] High request frequency from ${ip}: ${requestCount} requests`)

      // Don't block but apply additional rate limiting
      const rateLimiter = useRateLimiter()
      rateLimiter.setConfig('security-throttle', {
        requests: 10,
        window: 60,
        strategy: 'fixed-window'
      })
    }

    // Add security headers
    setHeaders(event, {
      'Content-Security-Policy': 'default-src \'self\'; script-src \'self\' \'unsafe-inline\'; style-src \'self\' \'unsafe-inline\';',
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
      'X-XSS-Protection': '1; mode=block',
      'Referrer-Policy': 'strict-origin-when-cross-origin',
      'Permissions-Policy': 'geolocation=(), microphone=(), camera=()'
    })
  } catch (error) {
    if (error.statusCode) {
      // Known security error, throw as-is
      throw error
    }

    // Unknown error in security middleware
    const context = createErrorContext('security-middleware', {
      requestId,
      endpoint: event.node.req.url || 'unknown',
      method: event.node.req.method || 'unknown',
      ip: getClientIP(event),
      userAgent: getHeader(event, 'user-agent')
    })

    await errorHandler.handleError(error, context)

    throw createError({
      statusCode: 500,
      statusMessage: 'Internal Server Error',
      data: {
        success: false,
        error: {
          code: 'SECURITY_CHECK_FAILED',
          message: 'Security validation failed'
        }
      }
    })
  }
})

/**
 * Calculate object nesting depth
 */
function getObjectDepth(obj: unknown, depth = 0): number {
  if (depth > 20) return depth // Prevent infinite recursion

  if (obj && typeof obj === 'object') {
    const depths = Object.values(obj).map(value =>
      getObjectDepth(value, depth + 1)
    )
    return Math.max(depth, ...depths)
  }

  return depth
}

/**
 * Track request frequency per IP (simplified in-memory tracking)
 */
const requestTracker = new Map<string, { count: number, resetTime: number }>()

async function trackRequestFrequency(ip: string): Promise<number> {
  const now = Date.now()
  const windowMs = 60 * 60 * 1000 // 1 hour window

  let tracker = requestTracker.get(ip)

  if (!tracker || now > tracker.resetTime) {
    tracker = { count: 1, resetTime: now + windowMs }
    requestTracker.set(ip, tracker)
    return 1
  }

  tracker.count++
  return tracker.count
}

// Cleanup old tracking data periodically
setInterval(() => {
  const now = Date.now()
  for (const [ip, tracker] of requestTracker.entries()) {
    if (now > tracker.resetTime) {
      requestTracker.delete(ip)
    }
  }
}, 5 * 60 * 1000) // Cleanup every 5 minutes
