/**
 * N8N Webhook Handler
 *
 * Receives webhook notifications from N8N workflows and processes them accordingly.
 * This endpoint serves as the central hub for N8N workflow notifications.
 */

export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  const headers = getHeaders(event)

  // Validate webhook signature/authentication
  const webhookSecret = useRuntimeConfig().n8nWebhookSecret
  const receivedSignature = headers['x-n8n-signature']

  if (!receivedSignature || !validateWebhookSignature(body, receivedSignature, webhookSecret)) {
    throw createError({
      statusCode: 401,
      statusMessage: 'Invalid webhook signature'
    })
  }

  try {
    const { event: eventType, ...eventData } = body

    console.log(`[N8N Webhook] Received event: ${eventType}`, {
      timestamp: new Date().toISOString(),
      data: eventData
    })

    switch (eventType) {
      case 'spotify_token_refreshed':
        await handleSpotifyTokenRefresh(eventData)
        break

      case 'playlist_enhancement_completed':
        await handlePlaylistEnhancementCompletion(eventData)
        break

      case 'apify_actor_maintenance_alert':
        await handleApifyMaintenanceAlert(eventData)
        break

      case 'genre_cache_updated':
        await handleGenreCacheUpdate(eventData)
        break

      default:
        console.warn(`[N8N Webhook] Unknown event type: ${eventType}`)
        break
    }

    return {
      success: true,
      message: 'Webhook processed successfully',
      eventType,
      timestamp: new Date().toISOString()
    }
  } catch (error: any) {
    console.error('[N8N Webhook] Processing error:', error)

    throw createError({
      statusCode: 500,
      statusMessage: 'Webhook processing failed',
      data: {
        error: error.message,
        eventType: body.event
      }
    })
  }
})

/**
 * Validate webhook signature to ensure requests come from N8N
 */
function validateWebhookSignature(payload: any, signature: string, secret: string): boolean {
  if (!signature || !secret) return false

  try {
    const crypto = require('crypto')
    const payloadString = typeof payload === 'string' ? payload : JSON.stringify(payload)
    const expectedSignature = crypto
      .createHmac('sha256', secret)
      .update(payloadString)
      .digest('hex')

    return crypto.timingSafeEqual(
      Buffer.from(signature, 'hex'),
      Buffer.from(expectedSignature, 'hex')
    )
  } catch (error) {
    console.error('[N8N Webhook] Signature validation error:', error)
    return false
  }
}

/**
 * Handle Spotify token refresh notifications
 */
async function handleSpotifyTokenRefresh(data: {
  token: string
  expires_at: string
}) {
  try {
    // Update local token cache if needed
    const redis = useStorage('redis')
    await redis.setItem('spotify_access_token', data.token, {
      ttl: new Date(data.expires_at).getTime() - Date.now()
    })

    console.log('[Spotify Token] Token refreshed and cached locally')

    // Notify relevant services about token refresh
    await $fetch('/api/internal/spotify/token-refreshed', {
      method: 'POST',
      body: {
        expires_at: data.expires_at,
        refreshed_at: new Date().toISOString()
      }
    }).catch((error) => {
      console.warn('[Spotify Token] Failed to notify services:', error.message)
    })
  } catch (error: any) {
    console.error('[Spotify Token] Refresh handling error:', error)
    throw error
  }
}

/**
 * Handle playlist enhancement completion notifications
 */
async function handlePlaylistEnhancementCompletion(data: {
  requestId: string
  successCount: number
  errorCount: number
}) {
  try {
    console.log(`[Playlist Enhancement] Completed for request ${data.requestId}:`, {
      successful: data.successCount,
      errors: data.errorCount,
      successRate: data.successCount / (data.successCount + data.errorCount) * 100
    })

    // Update enhancement job status
    const redis = useStorage('redis')
    await redis.setItem(`enhancement_status_${data.requestId}`, {
      status: 'completed',
      successCount: data.successCount,
      errorCount: data.errorCount,
      completedAt: new Date().toISOString()
    }, {
      ttl: 3600 // Keep status for 1 hour
    })

    // Send real-time notification to client if WebSocket connection exists
    await notifyClient(data.requestId, {
      type: 'enhancement_completed',
      data: {
        requestId: data.requestId,
        successCount: data.successCount,
        errorCount: data.errorCount
      }
    }).catch((error) => {
      console.warn('[Playlist Enhancement] Client notification failed:', error.message)
    })
  } catch (error: any) {
    console.error('[Playlist Enhancement] Completion handling error:', error)
    throw error
  }
}

/**
 * Handle Apify actor maintenance alerts
 */
async function handleApifyMaintenanceAlert(data: {
  actorId: string
  status: string
  message: string
}) {
  try {
    console.warn(`[Apify Maintenance] Actor ${data.actorId} status: ${data.status}`, {
      message: data.message,
      timestamp: new Date().toISOString()
    })

    // Store maintenance status
    const redis = useStorage('redis')
    await redis.setItem(`apify_actor_status_${data.actorId}`, {
      status: data.status,
      message: data.message,
      lastChecked: new Date().toISOString()
    }, {
      ttl: 7200 // Keep for 2 hours
    })

    // If actor is unavailable, disable enhancement features temporarily
    if (data.status === 'unavailable') {
      await redis.setItem('enhancement_disabled', true, {
        ttl: 1800 // Disable for 30 minutes
      })

      console.warn('[Apify Maintenance] Enhancement features temporarily disabled')
    }

    // Send alert to monitoring system
    await sendMaintenanceAlert({
      service: 'Apify Actor',
      actorId: data.actorId,
      status: data.status,
      message: data.message,
      severity: data.status === 'unavailable' ? 'high' : 'medium'
    }).catch((error) => {
      console.warn('[Apify Maintenance] Alert sending failed:', error.message)
    })
  } catch (error: any) {
    console.error('[Apify Maintenance] Alert handling error:', error)
    throw error
  }
}

/**
 * Handle genre cache update notifications
 */
async function handleGenreCacheUpdate(data: {
  genreCount: number
  updatedAt: string
}) {
  try {
    console.log(`[Genre Cache] Updated with ${data.genreCount} genres at ${data.updatedAt}`)

    // Update local cache metadata
    const redis = useStorage('redis')
    await redis.setItem('genre_cache_metadata', {
      genreCount: data.genreCount,
      lastUpdated: data.updatedAt,
      source: 'n8n_workflow'
    }, {
      ttl: 86400 // Keep metadata for 24 hours
    })

    // Invalidate any stale genre-related caches
    await invalidateGenreRelatedCaches()
  } catch (error: any) {
    console.error('[Genre Cache] Update handling error:', error)
    throw error
  }
}

/**
 * Send real-time notification to client via WebSocket or SSE
 */
async function notifyClient(requestId: string, notification: any) {
  // Implementation would depend on your WebSocket/SSE setup
  // This is a placeholder for real-time client notifications
  console.log(`[Client Notification] ${requestId}:`, notification)
}

/**
 * Send maintenance alert to monitoring/alerting system
 */
async function sendMaintenanceAlert(alert: {
  service: string
  actorId: string
  status: string
  message: string
  severity: 'low' | 'medium' | 'high'
}) {
  // Implementation would integrate with your alerting system (Slack, PagerDuty, etc.)
  console.log('[Maintenance Alert]', alert)
}

/**
 * Invalidate genre-related caches when genre list is updated
 */
async function invalidateGenreRelatedCaches() {
  const redis = useStorage('redis')

  // Clear genre validation caches
  const keys = await redis.getKeys('genre_validation_*')
  for (const key of keys) {
    await redis.removeItem(key)
  }

  console.log(`[Cache Invalidation] Cleared ${keys.length} genre-related cache entries`)
}
