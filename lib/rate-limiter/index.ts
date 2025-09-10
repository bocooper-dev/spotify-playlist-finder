/**
 * Rate Limiter Utility Library
 *
 * Provides comprehensive rate limiting functionality with multiple strategies,
 * distributed coordination, and intelligent backoff mechanisms.
 *
 * Features:
 * - Multiple rate limiting algorithms (Token Bucket, Sliding Window, Fixed Window)
 * - Per-user, per-IP, and global rate limiting
 * - Distributed rate limiting with Redis coordination
 * - Intelligent backoff and burst handling
 * - Rate limit headers and client feedback
 * - Monitoring and metrics collection
 */

export interface RateLimitConfig {
  // Basic rate limiting
  requests: number
  window: number // in seconds

  // Advanced options
  strategy: 'token-bucket' | 'sliding-window' | 'fixed-window'
  keyGenerator?: (context: RateLimitContext) => string
  skipSuccessfulRequests?: boolean
  skipFailedRequests?: boolean

  // Burst handling
  burst?: {
    enabled: boolean
    multiplier: number // Allow burst up to requests * multiplier
    cooldown: number // Cooldown period after burst
  }

  // Backoff configuration
  backoff?: {
    enabled: boolean
    strategy: 'exponential' | 'linear' | 'fibonacci'
    baseDelay: number
    maxDelay: number
    jitter: boolean
  }

  // Distributed coordination
  distributed?: {
    enabled: boolean
    redis?: {
      url: string
      keyPrefix: string
    }
    syncInterval: number
  }

  // Error handling
  onLimitReached?: (context: RateLimitContext) => Promise<void>
  onError?: (error: Error, context: RateLimitContext) => Promise<void>
}

export interface RateLimitContext {
  key: string
  ip?: string
  userId?: string
  userAgent?: string
  endpoint?: string
  method?: string
  timestamp: number
  headers?: Record<string, string>
  metadata?: Record<string, any>
}

export interface RateLimitResult {
  allowed: boolean
  limit: number
  remaining: number
  resetTime: number
  retryAfter?: number
  headers: Record<string, string>
  backoffDelay?: number
  burstUsed?: number
  strategy: string
}

export interface RateLimitState {
  tokens: number
  lastRefill: number
  requestHistory: number[]
  burstTokens?: number
  backoffUntil?: number
  consecutiveFailures: number
}

export interface RateLimitMetrics {
  totalRequests: number
  allowedRequests: number
  blockedRequests: number
  burstRequests: number
  backoffTriggers: number
  averageWaitTime: number
  peakRequestRate: number
  distributedSyncCount: number
}

export class RateLimitError extends Error {
  constructor(
    message: string,
    public code: string,
    public retryAfter?: number,
    public headers?: Record<string, string>
  ) {
    super(message)
    this.name = 'RateLimitError'
  }
}

/**
 * Abstract base class for rate limiting strategies
 */
abstract class RateLimitStrategy {
  abstract name: string

  abstract check(
    key: string,
    config: RateLimitConfig,
    state: RateLimitState
  ): Promise<RateLimitResult>

  protected generateHeaders(result: RateLimitResult): Record<string, string> {
    return {
      'X-RateLimit-Limit': result.limit.toString(),
      'X-RateLimit-Remaining': result.remaining.toString(),
      'X-RateLimit-Reset': result.resetTime.toString(),
      ...(result.retryAfter && { 'Retry-After': result.retryAfter.toString() }),
      ...(result.backoffDelay && { 'X-RateLimit-Backoff': result.backoffDelay.toString() })
    }
  }

  protected calculateRetryAfter(resetTime: number): number {
    return Math.max(0, Math.ceil((resetTime - Date.now()) / 1000))
  }
}

/**
 * Token Bucket rate limiting strategy
 */
class TokenBucketStrategy extends RateLimitStrategy {
  name = 'token-bucket'

  async check(
    key: string,
    config: RateLimitConfig,
    state: RateLimitState
  ): Promise<RateLimitResult> {
    const now = Date.now()
    const windowMs = config.window * 1000

    // Initialize state if needed
    if (!state.lastRefill) {
      state.tokens = config.requests
      state.lastRefill = now
    }

    // Calculate tokens to add based on time elapsed
    const timeElapsed = now - state.lastRefill
    const tokensToAdd = Math.floor((timeElapsed / windowMs) * config.requests)

    if (tokensToAdd > 0) {
      state.tokens = Math.min(config.requests, state.tokens + tokensToAdd)
      state.lastRefill = now
    }

    // Handle burst tokens if enabled
    let burstTokensAvailable = 0
    if (config.burst?.enabled) {
      const maxBurstTokens = config.requests * config.burst.multiplier - config.requests
      burstTokensAvailable = maxBurstTokens - (state.burstTokens || 0)
    }

    const totalTokensAvailable = state.tokens + burstTokensAvailable
    const allowed = totalTokensAvailable > 0

    if (allowed) {
      if (state.tokens > 0) {
        state.tokens--
      } else if (burstTokensAvailable > 0) {
        state.burstTokens = (state.burstTokens || 0) + 1
      }
    }

    const resetTime = state.lastRefill + windowMs

    return {
      allowed,
      limit: config.requests,
      remaining: Math.max(0, state.tokens),
      resetTime,
      retryAfter: allowed ? undefined : this.calculateRetryAfter(resetTime),
      headers: this.generateHeaders({
        allowed,
        limit: config.requests,
        remaining: Math.max(0, state.tokens),
        resetTime,
        strategy: this.name
      } as RateLimitResult),
      burstUsed: state.burstTokens,
      strategy: this.name
    }
  }
}

/**
 * Sliding Window rate limiting strategy
 */
class SlidingWindowStrategy extends RateLimitStrategy {
  name = 'sliding-window'

  async check(
    key: string,
    config: RateLimitConfig,
    state: RateLimitState
  ): Promise<RateLimitResult> {
    const now = Date.now()
    const windowMs = config.window * 1000
    const cutoff = now - windowMs

    // Initialize request history if needed
    if (!state.requestHistory) {
      state.requestHistory = []
    }

    // Remove old requests outside the window
    state.requestHistory = state.requestHistory.filter(timestamp => timestamp > cutoff)

    const currentRequests = state.requestHistory.length
    const allowed = currentRequests < config.requests

    if (allowed) {
      state.requestHistory.push(now)
    }

    const resetTime = state.requestHistory[0] ? state.requestHistory[0] + windowMs : now + windowMs

    return {
      allowed,
      limit: config.requests,
      remaining: Math.max(0, config.requests - currentRequests),
      resetTime,
      retryAfter: allowed ? undefined : this.calculateRetryAfter(resetTime),
      headers: this.generateHeaders({
        allowed,
        limit: config.requests,
        remaining: Math.max(0, config.requests - currentRequests),
        resetTime,
        strategy: this.name
      } as RateLimitResult),
      strategy: this.name
    }
  }
}

/**
 * Fixed Window rate limiting strategy
 */
class FixedWindowStrategy extends RateLimitStrategy {
  name = 'fixed-window'

  async check(
    key: string,
    config: RateLimitConfig,
    state: RateLimitState
  ): Promise<RateLimitResult> {
    const now = Date.now()
    const windowMs = config.window * 1000
    const windowStart = Math.floor(now / windowMs) * windowMs
    const windowEnd = windowStart + windowMs

    // Reset counters if we're in a new window
    if (!state.lastRefill || state.lastRefill < windowStart) {
      state.tokens = 0
      state.lastRefill = windowStart
    }

    const currentRequests = state.tokens
    const allowed = currentRequests < config.requests

    if (allowed) {
      state.tokens++
    }

    return {
      allowed,
      limit: config.requests,
      remaining: Math.max(0, config.requests - currentRequests),
      resetTime: windowEnd,
      retryAfter: allowed ? undefined : this.calculateRetryAfter(windowEnd),
      headers: this.generateHeaders({
        allowed,
        limit: config.requests,
        remaining: Math.max(0, config.requests - currentRequests),
        resetTime: windowEnd,
        strategy: this.name
      } as RateLimitResult),
      strategy: this.name
    }
  }
}

/**
 * Backoff calculator for intelligent delay strategies
 */
class BackoffCalculator {
  static calculateDelay(
    attempt: number,
    strategy: 'exponential' | 'linear' | 'fibonacci',
    baseDelay: number,
    maxDelay: number,
    jitter: boolean = false
  ): number {
    let delay: number

    switch (strategy) {
      case 'exponential':
        delay = baseDelay * Math.pow(2, attempt - 1)
        break
      case 'linear':
        delay = baseDelay * attempt
        break
      case 'fibonacci':
        delay = baseDelay * this.fibonacci(attempt)
        break
      default:
        delay = baseDelay
    }

    // Apply maximum delay limit
    delay = Math.min(delay, maxDelay)

    // Add jitter to prevent thundering herd
    if (jitter) {
      delay = delay * (0.5 + Math.random() * 0.5)
    }

    return Math.floor(delay)
  }

  private static fibonacci(n: number): number {
    if (n <= 1) return n

    let a = 0
    let b = 1

    for (let i = 2; i <= n; i++) {
      const temp = a + b
      a = b
      b = temp
    }

    return b
  }
}

/**
 * Main rate limiter class
 */
export class RateLimiter {
  private strategies = new Map<string, RateLimitStrategy>()
  private states = new Map<string, RateLimitState>()
  private metrics: RateLimitMetrics = {
    totalRequests: 0,
    allowedRequests: 0,
    blockedRequests: 0,
    burstRequests: 0,
    backoffTriggers: 0,
    averageWaitTime: 0,
    peakRequestRate: 0,
    distributedSyncCount: 0
  }

  private redis: unknown = null

  constructor(private configs: Map<string, RateLimitConfig> = new Map()) {
    this.initializeStrategies()
    this.initializeDistributed()
  }

  /**
   * Check rate limit for a given context
   */
  async checkLimit(
    limitName: string,
    context: RateLimitContext
  ): Promise<RateLimitResult> {
    const config = this.configs.get(limitName)
    if (!config) {
      throw new RateLimitError(
        `Rate limit configuration not found: ${limitName}`,
        'CONFIG_NOT_FOUND'
      )
    }

    const key = this.generateKey(limitName, context, config)
    const strategy = this.strategies.get(config.strategy)

    if (!strategy) {
      throw new RateLimitError(
        `Rate limit strategy not found: ${config.strategy}`,
        'STRATEGY_NOT_FOUND'
      )
    }

    // Get or initialize state
    const state = await this.getState(key, config)

    // Check for active backoff period
    if (state.backoffUntil && Date.now() < state.backoffUntil) {
      const backoffDelay = Math.ceil((state.backoffUntil - Date.now()) / 1000)

      return {
        allowed: false,
        limit: config.requests,
        remaining: 0,
        resetTime: state.backoffUntil,
        retryAfter: backoffDelay,
        backoffDelay,
        headers: this.generateBackoffHeaders(backoffDelay),
        strategy: strategy.name
      }
    }

    // Apply rate limiting strategy
    const result = await strategy.check(key, config, state)

    // Handle backoff if request was denied
    if (!result.allowed && config.backoff?.enabled) {
      state.consecutiveFailures++

      const backoffDelay = BackoffCalculator.calculateDelay(
        state.consecutiveFailures,
        config.backoff.strategy,
        config.backoff.baseDelay,
        config.backoff.maxDelay,
        config.backoff.jitter
      )

      state.backoffUntil = Date.now() + backoffDelay
      result.backoffDelay = Math.ceil(backoffDelay / 1000)
      this.metrics.backoffTriggers++
    } else if (result.allowed) {
      // Reset consecutive failures on successful request
      state.consecutiveFailures = 0
      state.backoffUntil = undefined
    }

    // Save updated state
    await this.saveState(key, state, config)

    // Update metrics
    this.updateMetrics(result)

    // Call configured callbacks
    if (!result.allowed && config.onLimitReached) {
      try {
        await config.onLimitReached(context)
      } catch (error) {
        console.warn('Rate limit callback error:', error)
      }
    }

    return result
  }

  /**
   * Add or update rate limit configuration
   */
  setConfig(name: string, config: RateLimitConfig): void {
    this.configs.set(name, config)
  }

  /**
   * Remove rate limit configuration
   */
  removeConfig(name: string): void {
    this.configs.delete(name)
  }

  /**
   * Get current metrics
   */
  getMetrics(): RateLimitMetrics {
    return { ...this.metrics }
  }

  /**
   * Reset metrics
   */
  resetMetrics(): void {
    this.metrics = {
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

  /**
   * Clear all rate limit states
   */
  async clearStates(pattern?: string): Promise<number> {
    let cleared = 0

    if (pattern) {
      const regex = new RegExp(pattern)
      for (const [key] of this.states) {
        if (regex.test(key)) {
          this.states.delete(key)
          cleared++

          // Also clear from Redis if distributed
          if (this.redis) {
            try {
              await this.redis.removeItem(key)
            } catch (error) {
              console.warn('Redis clear error:', error)
            }
          }
        }
      }
    } else {
      cleared = this.states.size
      this.states.clear()

      // Clear from Redis if distributed
      if (this.redis) {
        try {
          const keys = await this.redis.getKeys('ratelimit:*')
          for (const key of keys) {
            await this.redis.removeItem(key)
          }
        } catch (error) {
          console.warn('Redis clear all error:', error)
        }
      }
    }

    return cleared
  }

  /**
   * Get rate limit state for debugging
   */
  async getState(key: string, config?: RateLimitConfig): Promise<RateLimitState> {
    // Try distributed storage first
    if (config?.distributed?.enabled && this.redis) {
      try {
        const redisKey = `ratelimit:${key}`
        const data = await this.redis.getItem(redisKey)

        if (data) {
          const state = JSON.parse(data)
          // Also cache locally for performance
          this.states.set(key, state)
          return state
        }
      } catch (error) {
        console.warn('Redis get state error:', error)
      }
    }

    // Fallback to local state
    let state = this.states.get(key)
    if (!state) {
      state = {
        tokens: 0,
        lastRefill: 0,
        requestHistory: [],
        consecutiveFailures: 0
      }
      this.states.set(key, state)
    }

    return state
  }

  private async saveState(key: string, state: RateLimitState, config: RateLimitConfig): Promise<void> {
    // Save locally
    this.states.set(key, state)

    // Save to distributed storage if enabled
    if (config.distributed?.enabled && this.redis) {
      try {
        const redisKey = `ratelimit:${key}`
        await this.redis.setItem(redisKey, JSON.stringify(state), {
          ttl: config.window * 2 // Keep state for 2x the window duration
        })
      } catch (error) {
        console.warn('Redis save state error:', error)
      }
    }
  }

  private generateKey(limitName: string, context: RateLimitContext, config: RateLimitConfig): string {
    if (config.keyGenerator) {
      return config.keyGenerator(context)
    }

    // Default key generation strategy
    const parts = [limitName]

    if (context.userId) {
      parts.push(`user:${context.userId}`)
    } else if (context.ip) {
      parts.push(`ip:${context.ip}`)
    }

    if (context.endpoint) {
      parts.push(`endpoint:${context.endpoint}`)
    }

    return parts.join(':')
  }

  private initializeStrategies(): void {
    this.strategies.set('token-bucket', new TokenBucketStrategy())
    this.strategies.set('sliding-window', new SlidingWindowStrategy())
    this.strategies.set('fixed-window', new FixedWindowStrategy())
  }

  private async initializeDistributed(): Promise<void> {
    // Check if any config requires distributed rate limiting
    const needsDistributed = Array.from(this.configs.values())
      .some(config => config.distributed?.enabled)

    if (needsDistributed && import.meta.server) {
      try {
        this.redis = useStorage('redis')
      } catch (error) {
        console.warn('Failed to initialize Redis for distributed rate limiting:', error)
      }
    }
  }

  private generateBackoffHeaders(backoffDelay: number): Record<string, string> {
    return {
      'X-RateLimit-Backoff': backoffDelay.toString(),
      'Retry-After': backoffDelay.toString()
    }
  }

  private updateMetrics(result: RateLimitResult): void {
    this.metrics.totalRequests++

    if (result.allowed) {
      this.metrics.allowedRequests++
    } else {
      this.metrics.blockedRequests++
    }

    if (result.burstUsed && result.burstUsed > 0) {
      this.metrics.burstRequests++
    }

    // Update average wait time
    if (result.retryAfter) {
      const totalWaitTime = this.metrics.averageWaitTime * this.metrics.blockedRequests + result.retryAfter
      this.metrics.averageWaitTime = totalWaitTime / this.metrics.blockedRequests
    }
  }
}

/**
 * Express/Nuxt middleware for rate limiting
 */
export function createRateLimitMiddleware(
  rateLimiter: RateLimiter,
  limitName: string,
  options: {
    keyExtractor?: (event: unknown) => RateLimitContext
    onLimitReached?: (event: unknown, result: RateLimitResult) => Promise<void>
    skipIf?: (event: unknown) => boolean
  } = {}
) {
  return async (event: unknown) => {
    // Skip if condition is met
    if (options.skipIf && options.skipIf(event)) {
      return
    }

    // Extract context
    const context: RateLimitContext = options.keyExtractor
      ? options.keyExtractor(event)
      : {
          key: 'default',
          ip: getClientIP(event),
          endpoint: event.node?.req?.url || event.path,
          method: event.node?.req?.method || event.method,
          timestamp: Date.now(),
          headers: getHeaders(event)
        }

    try {
      const result = await rateLimiter.checkLimit(limitName, context)

      // Set rate limit headers
      for (const [key, value] of Object.entries(result.headers)) {
        setHeader(event, key, value)
      }

      if (!result.allowed) {
        if (options.onLimitReached) {
          await options.onLimitReached(event, result)
        }

        throw createError({
          statusCode: 429,
          statusMessage: 'Too Many Requests',
          data: {
            error: 'Rate limit exceeded',
            retryAfter: result.retryAfter,
            limit: result.limit,
            remaining: result.remaining,
            resetTime: result.resetTime
          }
        })
      }
    } catch (error) {
      if (error instanceof RateLimitError) {
        throw createError({
          statusCode: 429,
          statusMessage: 'Rate Limit Error',
          data: {
            error: error.message,
            code: error.code,
            retryAfter: error.retryAfter
          }
        })
      }

      // Log error but don't block request on rate limiter failures
      console.error('Rate limiter error:', error)
    }
  }
}

/**
 * Pre-configured rate limiters for common use cases
 */
export const CommonRateLimits = {
  // API rate limiting
  api: {
    requests: 100,
    window: 60,
    strategy: 'sliding-window' as const,
    burst: { enabled: true, multiplier: 1.5, cooldown: 300 }
  },

  // Authentication attempts
  auth: {
    requests: 5,
    window: 900, // 15 minutes
    strategy: 'fixed-window' as const,
    backoff: {
      enabled: true,
      strategy: 'exponential' as const,
      baseDelay: 1000,
      maxDelay: 60000,
      jitter: true
    }
  },

  // Search operations
  search: {
    requests: 20,
    window: 60,
    strategy: 'token-bucket' as const,
    burst: { enabled: true, multiplier: 2, cooldown: 180 }
  },

  // Export operations (expensive)
  export: {
    requests: 3,
    window: 300, // 5 minutes
    strategy: 'fixed-window' as const,
    backoff: {
      enabled: true,
      strategy: 'linear' as const,
      baseDelay: 5000,
      maxDelay: 30000,
      jitter: false
    }
  }
}

/**
 * Factory function to create rate limiter with common configurations
 */
export function createRateLimiter(customConfigs: Record<string, RateLimitConfig> = {}): RateLimiter {
  const configs = new Map<string, RateLimitConfig>()

  // Add common configurations
  for (const [name, config] of Object.entries(CommonRateLimits)) {
    configs.set(name, config)
  }

  // Add custom configurations
  for (const [name, config] of Object.entries(customConfigs)) {
    configs.set(name, config)
  }

  return new RateLimiter(configs)
}

/**
 * Global rate limiter instance
 */
let globalRateLimiter: RateLimiter | null = null

export function useRateLimiter(): RateLimiter {
  if (!globalRateLimiter) {
    globalRateLimiter = createRateLimiter()
  }

  return globalRateLimiter
}
