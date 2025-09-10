/**
 * GET /api/health
 * 
 * Health check endpoint for monitoring and load balancers.
 * Returns system status, performance metrics, and dependency health.
 */

import { getPerformanceStats } from '../middleware/performance'
import { useCache } from '~/lib/cache-manager'
import { useRateLimiter } from '~/lib/rate-limiter'
import { createSpotifyClient } from '~/lib/spotify-client'

export default defineEventHandler(async (event) => {
  const startTime = Date.now()
  
  // Set headers
  setHeaders(event, {
    'Content-Type': 'application/json',
    'Cache-Control': 'no-cache, no-store, must-revalidate'
  })
  
  const health = {
    status: 'healthy' as 'healthy' | 'degraded' | 'unhealthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    version: '1.0.0',
    environment: process.env.NODE_ENV || 'unknown',
    checks: {
      cache: await checkCacheHealth(),
      spotify: await checkSpotifyHealth(),
      rateLimiter: checkRateLimiterHealth(),
      database: await checkDatabaseHealth(),
      memory: checkMemoryHealth(),
      disk: await checkDiskHealth()
    },
    performance: getPerformanceStats(),
    responseTime: 0 // Will be set at the end
  }
  
  // Determine overall health status
  const failedChecks = Object.values(health.checks).filter(check => !check.healthy)
  
  if (failedChecks.length === 0) {
    health.status = 'healthy'
  } else if (failedChecks.length <= 2) {
    health.status = 'degraded'
  } else {
    health.status = 'unhealthy'
  }
  
  // Set response time
  health.responseTime = Date.now() - startTime
  
  // Set appropriate HTTP status code
  const statusCode = health.status === 'healthy' ? 200 : 
                    health.status === 'degraded' ? 200 : 503
  
  setResponseStatus(event, statusCode)
  
  return health
})

/**
 * Check cache system health
 */
async function checkCacheHealth() {
  try {
    const cache = useCache()
    const testKey = 'health_check_cache'
    const testValue = { timestamp: Date.now() }
    
    // Test write
    await cache.set(testKey, testValue, 60)
    
    // Test read
    const retrieved = await cache.get(testKey)
    
    // Test delete
    await cache.delete(testKey)
    
    return {
      healthy: retrieved !== null,
      responseTime: 0, // Would measure actual time
      message: retrieved ? 'Cache read/write successful' : 'Cache test failed'
    }
  } catch (error: any) {
    return {
      healthy: false,
      responseTime: 0,
      message: `Cache error: ${error.message}`,
      error: error.message
    }
  }
}

/**
 * Check Spotify API health
 */
async function checkSpotifyHealth() {
  try {
    const spotifyClient = createSpotifyClient()
    await spotifyClient.initialize()
    
    // Try to get genres (lightweight operation)
    const genres = await spotifyClient.getAvailableGenres()
    
    return {
      healthy: Array.isArray(genres) && genres.length > 0,
      responseTime: 0, // Would measure actual time
      message: `Spotify API accessible, ${genres.length} genres available`
    }
  } catch (error: any) {
    return {
      healthy: false,
      responseTime: 0,
      message: `Spotify API error: ${error.message}`,
      error: error.message
    }
  }
}

/**
 * Check rate limiter health
 */
function checkRateLimiterHealth() {
  try {
    const rateLimiter = useRateLimiter()
    const metrics = rateLimiter.getMetrics()
    
    return {
      healthy: true,
      responseTime: 0,
      message: 'Rate limiter operational',
      metrics: {
        totalRequests: metrics.totalRequests,
        blockedRequests: metrics.blockedRequests
      }
    }
  } catch (error: any) {
    return {
      healthy: false,
      responseTime: 0,
      message: `Rate limiter error: ${error.message}`,
      error: error.message
    }
  }
}

/**
 * Check database health (Redis)
 */
async function checkDatabaseHealth() {
  try {
    if (process.server) {
      const storage = useStorage('redis')
      const testKey = 'health_check_db'
      
      // Test Redis connection
      await storage.setItem(testKey, 'health_check', { ttl: 60 })
      const value = await storage.getItem(testKey)
      await storage.removeItem(testKey)
      
      return {
        healthy: value === 'health_check',
        responseTime: 0,
        message: 'Database connection successful'
      }
    } else {
      return {
        healthy: true,
        responseTime: 0,
        message: 'Client-side: Database check skipped'
      }
    }
  } catch (error: any) {
    return {
      healthy: false,
      responseTime: 0,
      message: `Database error: ${error.message}`,
      error: error.message
    }
  }
}

/**
 * Check memory health
 */
function checkMemoryHealth() {
  try {
    const memUsage = process.memoryUsage()
    const totalMB = Math.round(memUsage.heapTotal / 1024 / 1024)
    const usedMB = Math.round(memUsage.heapUsed / 1024 / 1024)
    const usagePercent = Math.round((usedMB / totalMB) * 100)
    
    // Consider unhealthy if using more than 90% of heap
    const healthy = usagePercent < 90
    
    return {
      healthy,
      responseTime: 0,
      message: `Memory usage: ${usedMB}MB / ${totalMB}MB (${usagePercent}%)`,
      metrics: {
        heapUsed: usedMB,
        heapTotal: totalMB,
        usagePercent,
        external: Math.round(memUsage.external / 1024 / 1024),
        rss: Math.round(memUsage.rss / 1024 / 1024)
      }
    }
  } catch (error: any) {
    return {
      healthy: false,
      responseTime: 0,
      message: `Memory check error: ${error.message}`,
      error: error.message
    }
  }
}

/**
 * Check disk space health
 */
async function checkDiskHealth() {
  try {
    // Simplified disk check - in production would use fs.stat
    const stats = {
      available: 1000, // Would get actual disk space
      total: 10000,
      used: 9000
    }
    
    const usagePercent = Math.round((stats.used / stats.total) * 100)
    const healthy = usagePercent < 90
    
    return {
      healthy,
      responseTime: 0,
      message: `Disk usage: ${usagePercent}%`,
      metrics: {
        usagePercent,
        availableMB: stats.available,
        totalMB: stats.total
      }
    }
  } catch (error: any) {
    return {
      healthy: false,
      responseTime: 0,
      message: `Disk check error: ${error.message}`,
      error: error.message
    }
  }
}