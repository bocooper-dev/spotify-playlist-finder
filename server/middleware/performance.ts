/**
 * Performance Middleware
 *
 * Provides performance optimization features:
 * - Response compression
 * - Caching headers
 * - Performance monitoring
 * - Response size optimization
 */

export default defineEventHandler(async (event) => {
  // Only apply to API routes
  if (!event.node.req.url?.startsWith('/api/')) {
    return
  }

  const startTime = Date.now()
  const url = event.node.req.url
  const method = event.node.req.method || 'GET'

  // Set cache headers based on endpoint
  setCacheHeaders(event, url, method)

  // Enable compression for JSON responses
  if (getHeader(event, 'accept-encoding')?.includes('gzip')) {
    setHeader(event, 'Vary', 'Accept-Encoding')
  }

  // Performance monitoring
  const originalSetHeader = event.node.res.setHeader
  let responseSize = 0

  // Monitor response size
  event.node.res.setHeader = function (name: string, value: string | string[] | number) {
    if (name.toLowerCase() === 'content-length') {
      responseSize = typeof value === 'number' ? value : parseInt(String(value)) || 0
    }
    return originalSetHeader.call(this, name, value)
  }

  // Hook into response end to collect metrics
  const originalEnd = event.node.res.end
  event.node.res.end = function (chunk?: unknown, encoding?: unknown) {
    const responseTime = Date.now() - startTime

    // Set performance headers
    setHeader(event, 'X-Response-Time', `${responseTime}ms`)
    setHeader(event, 'X-Process-Time', `${process.uptime()}s`)

    // Log performance metrics
    collectPerformanceMetrics({
      endpoint: url,
      method,
      responseTime,
      responseSize: responseSize || (chunk ? Buffer.byteLength(chunk) : 0),
      statusCode: event.node.res.statusCode || 200
    })

    return originalEnd.call(this, chunk, encoding)
  }
})

/**
 * Set appropriate cache headers based on endpoint
 */
function setCacheHeaders(event: unknown, url: string, method: string) {
  if (method !== 'GET') {
    // No caching for non-GET requests
    setHeaders(event, {
      'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
      'Pragma': 'no-cache',
      'Expires': '0'
    })
    return
  }

  // Set cache headers based on endpoint patterns
  if (url.includes('/api/spotify/genres')) {
    // Genres change infrequently - cache for 1 hour
    setHeaders(event, {
      'Cache-Control': 'public, max-age=3600, stale-while-revalidate=1800',
      'Vary': 'Accept-Encoding'
    })
  } else if (url.includes('/api/spotify/playlist/')) {
    // Individual playlists - cache for 30 minutes
    setHeaders(event, {
      'Cache-Control': 'public, max-age=1800, stale-while-revalidate=900',
      'Vary': 'Accept-Encoding'
    })
  } else if (url.includes('/api/spotify/search')) {
    // Search results - cache for 15 minutes
    setHeaders(event, {
      'Cache-Control': 'public, max-age=900, stale-while-revalidate=450',
      'Vary': 'Accept-Encoding'
    })
  } else {
    // Default - short cache
    setHeaders(event, {
      'Cache-Control': 'public, max-age=300, stale-while-revalidate=150',
      'Vary': 'Accept-Encoding'
    })
  }
}

/**
 * Collect and store performance metrics
 */
interface PerformanceMetric {
  endpoint: string
  method: string
  responseTime: number
  responseSize: number
  statusCode: number
  timestamp?: number
}

// In-memory metrics storage (in production, would use Redis or database)
const metricsBuffer: PerformanceMetric[] = []
const MAX_METRICS_BUFFER = 1000

function collectPerformanceMetrics(metric: PerformanceMetric) {
  metric.timestamp = Date.now()

  // Add to buffer
  metricsBuffer.push(metric)

  // Trim buffer if too large
  if (metricsBuffer.length > MAX_METRICS_BUFFER) {
    metricsBuffer.splice(0, metricsBuffer.length - MAX_METRICS_BUFFER)
  }

  // Log slow requests
  if (metric.responseTime > 2000) {
    console.warn(`[SLOW REQUEST] ${metric.method} ${metric.endpoint} took ${metric.responseTime}ms`)
  }

  // Log large responses
  if (metric.responseSize > 1024 * 1024) { // 1MB
    console.warn(`[LARGE RESPONSE] ${metric.method} ${metric.endpoint} returned ${(metric.responseSize / 1024 / 1024).toFixed(2)}MB`)
  }
}

/**
 * Get performance statistics (for monitoring endpoints)
 */
export function getPerformanceStats() {
  if (metricsBuffer.length === 0) {
    return {
      totalRequests: 0,
      averageResponseTime: 0,
      averageResponseSize: 0,
      slowRequests: 0,
      errorRate: 0,
      endpointStats: {}
    }
  }

  const totalRequests = metricsBuffer.length
  const averageResponseTime = metricsBuffer.reduce((sum, m) => sum + m.responseTime, 0) / totalRequests
  const averageResponseSize = metricsBuffer.reduce((sum, m) => sum + m.responseSize, 0) / totalRequests
  const slowRequests = metricsBuffer.filter(m => m.responseTime > 2000).length
  const errorRequests = metricsBuffer.filter(m => m.statusCode >= 400).length
  const errorRate = (errorRequests / totalRequests) * 100

  // Group by endpoint
  const endpointStats: Record<string, any> = {}

  metricsBuffer.forEach((metric) => {
    if (!endpointStats[metric.endpoint]) {
      endpointStats[metric.endpoint] = {
        requests: 0,
        totalResponseTime: 0,
        totalResponseSize: 0,
        errors: 0
      }
    }

    const stats = endpointStats[metric.endpoint]
    stats.requests++
    stats.totalResponseTime += metric.responseTime
    stats.totalResponseSize += metric.responseSize

    if (metric.statusCode >= 400) {
      stats.errors++
    }
  })

  // Calculate averages per endpoint
  Object.keys(endpointStats).forEach((endpoint) => {
    const stats = endpointStats[endpoint]
    stats.averageResponseTime = stats.totalResponseTime / stats.requests
    stats.averageResponseSize = stats.totalResponseSize / stats.requests
    stats.errorRate = (stats.errors / stats.requests) * 100

    // Remove totals to keep response clean
    delete stats.totalResponseTime
    delete stats.totalResponseSize
  })

  return {
    totalRequests,
    averageResponseTime: Math.round(averageResponseTime),
    averageResponseSize: Math.round(averageResponseSize),
    slowRequests,
    errorRate: Math.round(errorRate * 100) / 100,
    endpointStats
  }
}
