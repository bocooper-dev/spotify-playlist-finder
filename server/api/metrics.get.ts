/**
 * GET /api/metrics
 * 
 * Metrics endpoint for monitoring systems (Prometheus compatible).
 * Returns detailed performance and usage metrics.
 */

import { getPerformanceStats } from '../middleware/performance'
import { useCache } from '~/lib/cache-manager'
import { useRateLimiter } from '~/lib/rate-limiter'
import { useErrorHandler } from '~/lib/error-utils'

export default defineEventHandler(async (event) => {
  // Check for authorization (basic protection)
  const authHeader = getHeader(event, 'authorization')
  const metricsKey = process.env.METRICS_API_KEY
  
  if (metricsKey && authHeader !== `Bearer ${metricsKey}`) {
    throw createError({
      statusCode: 401,
      statusMessage: 'Unauthorized',
      data: { error: 'Invalid or missing API key' }
    })
  }
  
  setHeaders(event, {
    'Content-Type': 'text/plain; version=0.0.4',
    'Cache-Control': 'no-cache, no-store, must-revalidate'
  })
  
  const startTime = Date.now()
  
  try {
    // Collect metrics from various sources
    const performanceStats = getPerformanceStats()
    const cacheStats = await getCacheMetrics()
    const rateLimitStats = getRateLimitMetrics()
    const errorStats = getErrorMetrics()
    const systemStats = getSystemMetrics()
    
    // Generate Prometheus format metrics
    const metrics = generatePrometheusMetrics({
      performance: performanceStats,
      cache: cacheStats,
      rateLimit: rateLimitStats,
      errors: errorStats,
      system: systemStats,
      scrapeTime: Date.now() - startTime
    })
    
    return metrics
    
  } catch (error: any) {
    console.error('Metrics collection failed:', error)
    
    // Return minimal metrics on error
    return `# HELP spotify_metrics_error Metrics collection error
# TYPE spotify_metrics_error counter
spotify_metrics_error{error="${error.message}"} 1
`
  }
})

/**
 * Get cache metrics
 */
async function getCacheMetrics() {
  try {
    const cache = useCache()
    return await cache.getStats()
  } catch (error) {
    return {
      totalEntries: 0,
      totalSize: 0,
      hitRate: 0,
      missRate: 0,
      evictionCount: 0,
      compressionRatio: 1.0,
      tierStats: {
        memory: { entries: 0, size: 0, hits: 0, misses: 0 },
        redis: { entries: 0, size: 0, hits: 0, misses: 0 },
        browser: { entries: 0, size: 0, hits: 0, misses: 0 }
      }
    }
  }
}

/**
 * Get rate limiting metrics
 */
function getRateLimitMetrics() {
  try {
    const rateLimiter = useRateLimiter()
    return rateLimiter.getMetrics()
  } catch (error) {
    return {
      totalRequests: 0,
      allowedRequests: 0,
      blockedRequests: 0,
      burstRequests: 0,
      backoffTriggers: 0,
      averageWaitTime: 0,
      peakRequestRate: 0,
      distributedSyncCount: 0
    }
  }
}

/**
 * Get error handling metrics
 */
function getErrorMetrics() {
  try {
    const errorHandler = useErrorHandler()
    return errorHandler.getMetrics()
  } catch (error) {
    return {
      totalErrors: 0,
      errorsByType: {},
      errorsBySeverity: {},
      errorsByEndpoint: {},
      recoverySuccess: 0,
      recoveryFailures: 0,
      averageRecoveryTime: 0,
      circuitBreakerTrips: 0
    }
  }
}

/**
 * Get system metrics
 */
function getSystemMetrics() {
  try {
    const memUsage = process.memoryUsage()
    const cpuUsage = process.cpuUsage()
    
    return {
      memory: {
        heapUsed: memUsage.heapUsed,
        heapTotal: memUsage.heapTotal,
        external: memUsage.external,
        rss: memUsage.rss
      },
      cpu: {
        user: cpuUsage.user,
        system: cpuUsage.system
      },
      uptime: process.uptime(),
      version: process.version,
      platform: process.platform,
      arch: process.arch
    }
  } catch (error) {
    return {
      memory: { heapUsed: 0, heapTotal: 0, external: 0, rss: 0 },
      cpu: { user: 0, system: 0 },
      uptime: 0,
      version: 'unknown',
      platform: 'unknown',
      arch: 'unknown'
    }
  }
}

/**
 * Generate Prometheus format metrics
 */
function generatePrometheusMetrics(data: any): string {
  const lines: string[] = []
  
  // Helper function to add metric
  const addMetric = (name: string, type: string, help: string, value: number, labels = '') => {
    lines.push(`# HELP ${name} ${help}`)
    lines.push(`# TYPE ${name} ${type}`)
    lines.push(`${name}${labels} ${value}`)
    lines.push('')
  }
  
  // Performance metrics
  addMetric(
    'spotify_http_requests_total',
    'counter',
    'Total number of HTTP requests',
    data.performance.totalRequests
  )
  
  addMetric(
    'spotify_http_request_duration_ms',
    'gauge',
    'Average HTTP request duration in milliseconds',
    data.performance.averageResponseTime
  )
  
  addMetric(
    'spotify_http_response_size_bytes',
    'gauge',
    'Average HTTP response size in bytes',
    data.performance.averageResponseSize
  )
  
  addMetric(
    'spotify_http_slow_requests_total',
    'counter',
    'Total number of slow requests (>2s)',
    data.performance.slowRequests
  )
  
  addMetric(
    'spotify_http_error_rate_percent',
    'gauge',
    'HTTP error rate percentage',
    data.performance.errorRate
  )
  
  // Cache metrics
  addMetric(
    'spotify_cache_entries_total',
    'gauge',
    'Total number of cache entries',
    data.cache.totalEntries
  )
  
  addMetric(
    'spotify_cache_size_bytes',
    'gauge',
    'Total cache size in bytes',
    data.cache.totalSize
  )
  
  addMetric(
    'spotify_cache_hit_rate_percent',
    'gauge',
    'Cache hit rate percentage',
    data.cache.hitRate
  )
  
  addMetric(
    'spotify_cache_evictions_total',
    'counter',
    'Total number of cache evictions',
    data.cache.evictionCount
  )
  
  // Cache tier metrics
  Object.entries(data.cache.tierStats).forEach(([tier, stats]: [string, any]) => {
    addMetric(
      'spotify_cache_tier_entries',
      'gauge',
      `Cache entries by tier`,
      stats.entries,
      `{tier="${tier}"}`
    )
    
    addMetric(
      'spotify_cache_tier_hits_total',
      'counter',
      `Cache hits by tier`,
      stats.hits,
      `{tier="${tier}"}`
    )
    
    addMetric(
      'spotify_cache_tier_misses_total',
      'counter',
      `Cache misses by tier`,
      stats.misses,
      `{tier="${tier}"}`
    )
  })
  
  // Rate limiting metrics
  addMetric(
    'spotify_rate_limit_requests_total',
    'counter',
    'Total number of rate limit checks',
    data.rateLimit.totalRequests
  )
  
  addMetric(
    'spotify_rate_limit_blocked_total',
    'counter',
    'Total number of blocked requests',
    data.rateLimit.blockedRequests
  )
  
  addMetric(
    'spotify_rate_limit_burst_requests_total',
    'counter',
    'Total number of burst requests',
    data.rateLimit.burstRequests
  )
  
  addMetric(
    'spotify_rate_limit_backoff_triggers_total',
    'counter',
    'Total number of backoff triggers',
    data.rateLimit.backoffTriggers
  )
  
  addMetric(
    'spotify_rate_limit_wait_time_ms',
    'gauge',
    'Average wait time for rate limiting in milliseconds',
    data.rateLimit.averageWaitTime
  )
  
  // Error metrics
  addMetric(
    'spotify_errors_total',
    'counter',
    'Total number of errors',
    data.errors.totalErrors
  )
  
  addMetric(
    'spotify_error_recovery_success_total',
    'counter',
    'Total number of successful error recoveries',
    data.errors.recoverySuccess
  )
  
  addMetric(
    'spotify_error_recovery_failures_total',
    'counter',
    'Total number of failed error recoveries',
    data.errors.recoveryFailures
  )
  
  addMetric(
    'spotify_circuit_breaker_trips_total',
    'counter',
    'Total number of circuit breaker trips',
    data.errors.circuitBreakerTrips
  )
  
  // Error by type
  Object.entries(data.errors.errorsByType).forEach(([type, count]: [string, any]) => {
    addMetric(
      'spotify_errors_by_type_total',
      'counter',
      'Errors by type',
      count,
      `{type="${type}"}`
    )
  })
  
  // Error by severity
  Object.entries(data.errors.errorsBySeverity).forEach(([severity, count]: [string, any]) => {
    addMetric(
      'spotify_errors_by_severity_total',
      'counter',
      'Errors by severity',
      count,
      `{severity="${severity}"}`
    )
  })
  
  // System metrics
  addMetric(
    'spotify_memory_heap_used_bytes',
    'gauge',
    'Memory heap used in bytes',
    data.system.memory.heapUsed
  )
  
  addMetric(
    'spotify_memory_heap_total_bytes',
    'gauge',
    'Memory heap total in bytes',
    data.system.memory.heapTotal
  )
  
  addMetric(
    'spotify_memory_external_bytes',
    'gauge',
    'External memory in bytes',
    data.system.memory.external
  )
  
  addMetric(
    'spotify_memory_rss_bytes',
    'gauge',
    'Resident set size in bytes',
    data.system.memory.rss
  )
  
  addMetric(
    'spotify_cpu_user_microseconds',
    'counter',
    'CPU user time in microseconds',
    data.system.cpu.user
  )
  
  addMetric(
    'spotify_cpu_system_microseconds',
    'counter',
    'CPU system time in microseconds',
    data.system.cpu.system
  )
  
  addMetric(
    'spotify_uptime_seconds',
    'gauge',
    'Process uptime in seconds',
    data.system.uptime
  )
  
  // Scrape metrics
  addMetric(
    'spotify_metrics_scrape_duration_ms',
    'gauge',
    'Time taken to collect metrics in milliseconds',
    data.scrapeTime
  )
  
  return lines.join('\n')
}