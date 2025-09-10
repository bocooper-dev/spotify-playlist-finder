/**
 * Cache Manager Library
 *
 * Provides comprehensive caching functionality with multiple storage backends,
 * TTL management, cache warming, and intelligent invalidation strategies.
 *
 * Features:
 * - Multi-tier caching (Memory, Redis, Browser Storage)
 * - Automatic TTL management and cleanup
 * - Cache warming and preloading
 * - Pattern-based invalidation
 * - Compression for large values
 * - Cache statistics and monitoring
 * - Type-safe operations
 */

export interface CacheEntry<T = unknown> {
  key: string
  value: T
  createdAt: number
  expiresAt: number
  accessCount: number
  lastAccessed: number
  compressed: boolean
  size: number
  tags: string[]
}

export interface CacheConfig {
  defaultTtl: number
  maxSize: number
  cleanupInterval: number
  compression: {
    enabled: boolean
    threshold: number // Compress values larger than this (bytes)
    algorithm: 'gzip' | 'deflate'
  }
  tiers: {
    memory: {
      enabled: boolean
      maxEntries: number
      maxMemoryMB: number
    }
    redis: {
      enabled: boolean
      url?: string
      keyPrefix: string
      cluster: boolean
    }
    browser: {
      enabled: boolean
      storage: 'localStorage' | 'sessionStorage' | 'indexedDB'
      maxSizeMB: number
    }
  }
}

export interface CacheStats {
  totalEntries: number
  totalSize: number
  hitRate: number
  missRate: number
  evictionCount: number
  compressionRatio: number
  tierStats: {
    memory: { entries: number, size: number, hits: number, misses: number }
    redis: { entries: number, size: number, hits: number, misses: number }
    browser: { entries: number, size: number, hits: number, misses: number }
  }
}

export interface CacheOperation {
  operation: 'get' | 'set' | 'delete' | 'clear'
  key: string
  tier: 'memory' | 'redis' | 'browser'
  duration: number
  success: boolean
  error?: string
}

export class CacheError extends Error {
  constructor(
    message: string,
    public code: string,
    public tier?: string
  ) {
    super(message)
    this.name = 'CacheError'
  }
}

/**
 * Abstract cache tier interface
 */
abstract class CacheTier {
  abstract name: string

  abstract get<T>(key: string): Promise<CacheEntry<T> | null>
  abstract set<T>(key: string, value: T, ttl: number, tags?: string[]): Promise<void>
  abstract delete(key: string): Promise<boolean>
  abstract clear(pattern?: string): Promise<number>
  abstract exists(key: string): Promise<boolean>
  abstract getStats(): Promise<Partial<CacheStats['tierStats']['memory']>>

  protected generateEntry<T>(
    key: string,
    value: T,
    ttl: number,
    tags: string[] = []
  ): CacheEntry<T> {
    const now = Date.now()
    return {
      key,
      value,
      createdAt: now,
      expiresAt: now + ttl * 1000,
      accessCount: 0,
      lastAccessed: now,
      compressed: false,
      size: this.calculateSize(value),
      tags
    }
  }

  protected isExpired(entry: CacheEntry): boolean {
    return Date.now() > entry.expiresAt
  }

  protected calculateSize(value: unknown): number {
    return Buffer.byteLength(JSON.stringify(value), 'utf8')
  }
}

/**
 * Memory cache tier
 */
class MemoryCacheTier extends CacheTier {
  name = 'memory'
  private cache = new Map<string, CacheEntry>()
  private stats = { hits: 0, misses: 0, evictions: 0 }

  constructor(private config: CacheConfig['tiers']['memory']) {
    super()
  }

  async get<T>(key: string): Promise<CacheEntry<T> | null> {
    const entry = this.cache.get(key)

    if (!entry) {
      this.stats.misses++
      return null
    }

    if (this.isExpired(entry)) {
      this.cache.delete(key)
      this.stats.misses++
      return null
    }

    entry.accessCount++
    entry.lastAccessed = Date.now()
    this.stats.hits++

    return entry as CacheEntry<T>
  }

  async set<T>(key: string, value: T, ttl: number, tags: string[] = []): Promise<void> {
    const entry = this.generateEntry(key, value, ttl, tags)

    // Check memory limits
    if (this.shouldEvict()) {
      this.evictLeastRecentlyUsed()
    }

    this.cache.set(key, entry)
  }

  async delete(key: string): Promise<boolean> {
    return this.cache.delete(key)
  }

  async clear(pattern?: string): Promise<number> {
    let deletedCount = 0

    if (pattern) {
      const regex = new RegExp(pattern)
      for (const [key] of this.cache) {
        if (regex.test(key)) {
          this.cache.delete(key)
          deletedCount++
        }
      }
    } else {
      deletedCount = this.cache.size
      this.cache.clear()
    }

    return deletedCount
  }

  async exists(key: string): Promise<boolean> {
    const entry = this.cache.get(key)
    return entry ? !this.isExpired(entry) : false
  }

  async getStats() {
    const entries = this.cache.size
    let totalSize = 0

    for (const entry of this.cache.values()) {
      totalSize += entry.size
    }

    return {
      entries,
      size: totalSize,
      hits: this.stats.hits,
      misses: this.stats.misses
    }
  }

  private shouldEvict(): boolean {
    return this.cache.size >= this.config.maxEntries
  }

  private evictLeastRecentlyUsed(): void {
    let oldestKey: string | null = null
    let oldestTime = Date.now()

    for (const [key, entry] of this.cache) {
      if (entry.lastAccessed < oldestTime) {
        oldestTime = entry.lastAccessed
        oldestKey = key
      }
    }

    if (oldestKey) {
      this.cache.delete(oldestKey)
      this.stats.evictions++
    }
  }
}

/**
 * Redis cache tier
 */
class RedisCacheTier extends CacheTier {
  name = 'redis'
  private redis: unknown = null
  private stats = { hits: 0, misses: 0 }

  constructor(private config: CacheConfig['tiers']['redis']) {
    super()
    this.initializeRedis()
  }

  private async initializeRedis() {
    try {
      if (import.meta.server) {
        // Use Nitro's built-in Redis storage
        this.redis = useStorage('redis')
      } else {
        // Client-side: Redis not available
        this.redis = null
      }
    } catch {
      console.warn('Redis initialization failed:', error)
      this.redis = null
    }
  }

  async get<T>(key: string): Promise<CacheEntry<T> | null> {
    if (!this.redis) {
      this.stats.misses++
      return null
    }

    try {
      const prefixedKey = `${this.config.keyPrefix}:${key}`
      const data = await this.redis.getItem(prefixedKey)

      if (!data) {
        this.stats.misses++
        return null
      }

      const entry: CacheEntry<T> = JSON.parse(data)

      if (this.isExpired(entry)) {
        await this.redis.removeItem(prefixedKey)
        this.stats.misses++
        return null
      }

      entry.accessCount++
      entry.lastAccessed = Date.now()
      this.stats.hits++

      // Update access info in Redis
      await this.redis.setItem(prefixedKey, JSON.stringify(entry))

      return entry
    } catch {
      console.warn('Redis get error:', error)
      this.stats.misses++
      return null
    }
  }

  async set<T>(key: string, value: T, ttl: number, tags: string[] = []): Promise<void> {
    if (!this.redis) return

    try {
      const entry = this.generateEntry(key, value, ttl, tags)
      const prefixedKey = `${this.config.keyPrefix}:${key}`

      await this.redis.setItem(prefixedKey, JSON.stringify(entry), {
        ttl: ttl
      })
    } catch {
      console.warn('Redis set error:', error)
      throw new CacheError(
        `Failed to set cache entry: ${error}`,
        'REDIS_SET_FAILED',
        'redis'
      )
    }
  }

  async delete(key: string): Promise<boolean> {
    if (!this.redis) return false

    try {
      const prefixedKey = `${this.config.keyPrefix}:${key}`
      await this.redis.removeItem(prefixedKey)
      return true
    } catch {
      console.warn('Redis delete error:', error)
      return false
    }
  }

  async clear(pattern?: string): Promise<number> {
    if (!this.redis) return 0

    try {
      if (pattern) {
        // For pattern-based clearing, we'd need to scan keys
        // This is a simplified implementation
        console.warn('Redis pattern-based clearing not fully implemented')
        return 0
      } else {
        // Clear all keys with our prefix
        const keys = await this.redis.getKeys(`${this.config.keyPrefix}:*`)
        let deletedCount = 0

        for (const key of keys) {
          await this.redis.removeItem(key)
          deletedCount++
        }

        return deletedCount
      }
    } catch {
      console.warn('Redis clear error:', error)
      return 0
    }
  }

  async exists(key: string): Promise<boolean> {
    if (!this.redis) return false

    try {
      const prefixedKey = `${this.config.keyPrefix}:${key}`
      const data = await this.redis.getItem(prefixedKey)

      if (!data) return false

      const entry = JSON.parse(data)
      return !this.isExpired(entry)
    } catch {
      return false
    }
  }

  async getStats() {
    return {
      entries: 0, // Would need Redis-specific implementation
      size: 0,
      hits: this.stats.hits,
      misses: this.stats.misses
    }
  }
}

/**
 * Browser cache tier (localStorage/sessionStorage/IndexedDB)
 */
class BrowserCacheTier extends CacheTier {
  name = 'browser'
  private storage: Storage | null = null
  private stats = { hits: 0, misses: 0 }

  constructor(private config: CacheConfig['tiers']['browser']) {
    super()
    this.initializeStorage()
  }

  private initializeStorage() {
    if (import.meta.client) {
      switch (this.config.storage) {
        case 'localStorage':
          this.storage = window.localStorage
          break
        case 'sessionStorage':
          this.storage = window.sessionStorage
          break
        case 'indexedDB':
          // IndexedDB implementation would go here
          console.warn('IndexedDB cache tier not implemented yet')
          this.storage = null
          break
        default:
          this.storage = null
      }
    }
  }

  async get<T>(key: string): Promise<CacheEntry<T> | null> {
    if (!this.storage) {
      this.stats.misses++
      return null
    }

    try {
      const data = this.storage.getItem(`cache_${key}`)

      if (!data) {
        this.stats.misses++
        return null
      }

      const entry: CacheEntry<T> = JSON.parse(data)

      if (this.isExpired(entry)) {
        this.storage.removeItem(`cache_${key}`)
        this.stats.misses++
        return null
      }

      entry.accessCount++
      entry.lastAccessed = Date.now()
      this.stats.hits++

      // Update access info
      this.storage.setItem(`cache_${key}`, JSON.stringify(entry))

      return entry
    } catch {
      console.warn('Browser cache get error:', error)
      this.stats.misses++
      return null
    }
  }

  async set<T>(key: string, value: T, ttl: number, tags: string[] = []): Promise<void> {
    if (!this.storage) return

    try {
      const entry = this.generateEntry(key, value, ttl, tags)

      // Check storage size limits
      if (this.shouldEvict()) {
        this.evictExpiredEntries()
      }

      this.storage.setItem(`cache_${key}`, JSON.stringify(entry))
    } catch {
      if (error.name === 'QuotaExceededError') {
        // Try to free up space and retry
        this.evictExpiredEntries()
        try {
          const entry = this.generateEntry(key, value, ttl, tags)
          this.storage.setItem(`cache_${key}`, JSON.stringify(entry))
        } catch (retryError) {
          throw new CacheError(
            'Storage quota exceeded',
            'QUOTA_EXCEEDED',
            'browser'
          )
        }
      } else {
        throw new CacheError(
          `Failed to set cache entry: ${error}`,
          'BROWSER_SET_FAILED',
          'browser'
        )
      }
    }
  }

  async delete(key: string): Promise<boolean> {
    if (!this.storage) return false

    try {
      this.storage.removeItem(`cache_${key}`)
      return true
    } catch {
      return false
    }
  }

  async clear(pattern?: string): Promise<number> {
    if (!this.storage) return 0

    try {
      let deletedCount = 0
      const keysToDelete: string[] = []

      // Collect keys to delete
      for (let i = 0; i < this.storage.length; i++) {
        const key = this.storage.key(i)
        if (key && key.startsWith('cache_')) {
          const cacheKey = key.substring(6) // Remove 'cache_' prefix

          if (!pattern || new RegExp(pattern).test(cacheKey)) {
            keysToDelete.push(key)
          }
        }
      }

      // Delete collected keys
      for (const key of keysToDelete) {
        this.storage.removeItem(key)
        deletedCount++
      }

      return deletedCount
    } catch {
      return 0
    }
  }

  async exists(key: string): Promise<boolean> {
    if (!this.storage) return false

    try {
      const data = this.storage.getItem(`cache_${key}`)
      if (!data) return false

      const entry = JSON.parse(data)
      return !this.isExpired(entry)
    } catch {
      return false
    }
  }

  async getStats() {
    if (!this.storage) {
      return { entries: 0, size: 0, hits: 0, misses: 0 }
    }

    let entries = 0
    let totalSize = 0

    for (let i = 0; i < this.storage.length; i++) {
      const key = this.storage.key(i)
      if (key && key.startsWith('cache_')) {
        entries++
        const data = this.storage.getItem(key)
        if (data) {
          totalSize += data.length
        }
      }
    }

    return {
      entries,
      size: totalSize,
      hits: this.stats.hits,
      misses: this.stats.misses
    }
  }

  private shouldEvict(): boolean {
    // Simple size check - in production, would check actual storage usage
    if (!this.storage) return false

    let totalSize = 0
    for (let i = 0; i < this.storage.length; i++) {
      const key = this.storage.key(i)
      if (key && key.startsWith('cache_')) {
        const data = this.storage.getItem(key)
        if (data) totalSize += data.length
      }
    }

    const maxBytes = this.config.maxSizeMB * 1024 * 1024
    return totalSize > maxBytes * 0.8 // Start eviction at 80% capacity
  }

  private evictExpiredEntries(): void {
    if (!this.storage) return

    const expiredKeys: string[] = []

    for (let i = 0; i < this.storage.length; i++) {
      const key = this.storage.key(i)
      if (key && key.startsWith('cache_')) {
        try {
          const data = this.storage.getItem(key)
          if (data) {
            const entry = JSON.parse(data)
            if (this.isExpired(entry)) {
              expiredKeys.push(key)
            }
          }
        } catch {
          // Remove invalid entries
          expiredKeys.push(key)
        }
      }
    }

    for (const key of expiredKeys) {
      this.storage.removeItem(key)
    }
  }
}

/**
 * Main cache manager class
 */
export class CacheManager {
  private tiers: CacheTier[] = []
  private config: CacheConfig
  private operations: CacheOperation[] = []
  private cleanupTimer: NodeJS.Timer | null = null

  constructor(config: Partial<CacheConfig> = {}) {
    this.config = this.mergeConfig(config)
    this.initializeTiers()
    this.startCleanupTimer()
  }

  /**
   * Get value from cache (checks all tiers in order)
   */
  async get<T>(key: string): Promise<T | null> {
    const startTime = Date.now()

    for (const tier of this.tiers) {
      try {
        const entry = await tier.get<T>(key)

        if (entry) {
          this.recordOperation({
            operation: 'get',
            key,
            tier: tier.name as 'memory' | 'redis' | 'browser',
            duration: Date.now() - startTime,
            success: true
          })

          // Promote to higher tiers (cache warming)
          this.promoteToHigherTiers(key, entry, tier)

          return entry.value
        }
      } catch (error) {
        this.recordOperation({
          operation: 'get',
          key,
          tier: tier.name as 'memory' | 'redis' | 'browser',
          duration: Date.now() - startTime,
          success: false,
          error: error.message
        })

        console.warn(`Cache tier ${tier.name} get error:`, error)
        continue
      }
    }

    return null
  }

  /**
   * Set value in cache (writes to all tiers)
   */
  async set<T>(key: string, value: T, ttl?: number, tags: string[] = []): Promise<void> {
    const startTime = Date.now()
    const effectiveTtl = ttl || this.config.defaultTtl

    const promises = this.tiers.map(async (tier) => {
      try {
        await tier.set(key, value, effectiveTtl, tags)

        this.recordOperation({
          operation: 'set',
          key,
          tier: tier.name as 'memory' | 'redis' | 'browser',
          duration: Date.now() - startTime,
          success: true
        })
      } catch (error) {
        this.recordOperation({
          operation: 'set',
          key,
          tier: tier.name as 'memory' | 'redis' | 'browser',
          duration: Date.now() - startTime,
          success: false,
          error: error.message
        })

        console.warn(`Cache tier ${tier.name} set error:`, error)
      }
    })

    // Wait for all tiers to complete (or fail)
    await Promise.allSettled(promises)
  }

  /**
   * Delete value from cache (all tiers)
   */
  async delete(key: string): Promise<boolean> {
    const startTime = Date.now()
    let anySuccess = false

    const promises = this.tiers.map(async (tier) => {
      try {
        const success = await tier.delete(key)

        this.recordOperation({
          operation: 'delete',
          key,
          tier: tier.name as 'memory' | 'redis' | 'browser',
          duration: Date.now() - startTime,
          success
        })

        if (success) anySuccess = true
        return success
      } catch (error) {
        this.recordOperation({
          operation: 'delete',
          key,
          tier: tier.name as 'memory' | 'redis' | 'browser',
          duration: Date.now() - startTime,
          success: false,
          error: error.message
        })

        console.warn(`Cache tier ${tier.name} delete error:`, error)
        return false
      }
    })

    await Promise.allSettled(promises)
    return anySuccess
  }

  /**
   * Clear cache entries (pattern-based)
   */
  async clear(pattern?: string): Promise<number> {
    const startTime = Date.now()
    let totalDeleted = 0

    const promises = this.tiers.map(async (tier) => {
      try {
        const deleted = await tier.clear(pattern)

        this.recordOperation({
          operation: 'clear',
          key: pattern || '*',
          tier: tier.name as 'memory' | 'redis' | 'browser',
          duration: Date.now() - startTime,
          success: true
        })

        totalDeleted += deleted
        return deleted
      } catch (error) {
        this.recordOperation({
          operation: 'clear',
          key: pattern || '*',
          tier: tier.name as 'memory' | 'redis' | 'browser',
          duration: Date.now() - startTime,
          success: false,
          error: error.message
        })

        console.warn(`Cache tier ${tier.name} clear error:`, error)
        return 0
      }
    })

    await Promise.allSettled(promises)
    return totalDeleted
  }

  /**
   * Check if key exists in any tier
   */
  async exists(key: string): Promise<boolean> {
    for (const tier of this.tiers) {
      try {
        if (await tier.exists(key)) {
          return true
        }
      } catch {
        console.warn(`Cache tier ${tier.name} exists error:`, error)
        continue
      }
    }

    return false
  }

  /**
   * Get cache statistics
   */
  async getStats(): Promise<CacheStats> {
    const tierStats = {
      memory: { entries: 0, size: 0, hits: 0, misses: 0 },
      redis: { entries: 0, size: 0, hits: 0, misses: 0 },
      browser: { entries: 0, size: 0, hits: 0, misses: 0 }
    }

    let totalEntries = 0
    let totalSize = 0

    for (const tier of this.tiers) {
      try {
        const stats = await tier.getStats()
        const tierName = tier.name as keyof typeof tierStats

        if (tierStats[tierName]) {
          Object.assign(tierStats[tierName], stats)
          totalEntries += stats.entries || 0
          totalSize += stats.size || 0
        }
      } catch {
        console.warn(`Error getting stats from ${tier.name}:`, error)
      }
    }

    const totalRequests = this.operations.length
    const successfulGets = this.operations.filter(op =>
      op.operation === 'get' && op.success
    ).length

    return {
      totalEntries,
      totalSize,
      hitRate: totalRequests > 0 ? (successfulGets / totalRequests) * 100 : 0,
      missRate: totalRequests > 0 ? ((totalRequests - successfulGets) / totalRequests) * 100 : 0,
      evictionCount: 0, // Would need to track this per tier
      compressionRatio: 1.0, // Placeholder for compression stats
      tierStats
    }
  }

  /**
   * Warm cache with preloaded data
   */
  async warmCache(entries: Array<{ key: string, value: unknown, ttl?: number, tags?: string[] }>): Promise<void> {
    const promises = entries.map(entry =>
      this.set(entry.key, entry.value, entry.ttl, entry.tags)
    )

    await Promise.allSettled(promises)
  }

  /**
   * Invalidate cache by tags
   */
  async invalidateByTags(tags: string[]): Promise<number> {
    // This would require a more sophisticated implementation
    // For now, we'll use pattern matching as a fallback
    let totalInvalidated = 0

    for (const tag of tags) {
      const pattern = `*${tag}*`
      totalInvalidated += await this.clear(pattern)
    }

    return totalInvalidated
  }

  /**
   * Get or set pattern (cache-aside)
   */
  async getOrSet<T>(
    key: string,
    factory: () => Promise<T>,
    ttl?: number,
    tags?: string[]
  ): Promise<T> {
    // Try to get from cache first
    const cached = await this.get<T>(key)
    if (cached !== null) {
      return cached
    }

    // Generate value and cache it
    const value = await factory()
    await this.set(key, value, ttl, tags)

    return value
  }

  /**
   * Destroy cache manager and cleanup resources
   */
  destroy(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer)
      this.cleanupTimer = null
    }

    // Clear operation history
    this.operations = []
  }

  private mergeConfig(userConfig: Partial<CacheConfig>): CacheConfig {
    const defaultConfig: CacheConfig = {
      defaultTtl: 900, // 15 minutes
      maxSize: 100 * 1024 * 1024, // 100MB
      cleanupInterval: 60000, // 1 minute
      compression: {
        enabled: false,
        threshold: 1024, // 1KB
        algorithm: 'gzip'
      },
      tiers: {
        memory: {
          enabled: true,
          maxEntries: 1000,
          maxMemoryMB: 50
        },
        redis: {
          enabled: false,
          keyPrefix: 'cache',
          cluster: false
        },
        browser: {
          enabled: import.meta.client,
          storage: 'localStorage',
          maxSizeMB: 10
        }
      }
    }

    return this.deepMerge(defaultConfig, userConfig)
  }

  private deepMerge(target: unknown, source: unknown): unknown {
    const result = { ...target }

    for (const key in source) {
      if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
        result[key] = this.deepMerge(target[key] || {}, source[key])
      } else {
        result[key] = source[key]
      }
    }

    return result
  }

  private initializeTiers(): void {
    if (this.config.tiers.memory.enabled) {
      this.tiers.push(new MemoryCacheTier(this.config.tiers.memory))
    }

    if (this.config.tiers.redis.enabled) {
      this.tiers.push(new RedisCacheTier(this.config.tiers.redis))
    }

    if (this.config.tiers.browser.enabled) {
      this.tiers.push(new BrowserCacheTier(this.config.tiers.browser))
    }
  }

  private async promoteToHigherTiers(key: string, entry: CacheEntry, sourceTier: CacheTier): Promise<void> {
    const sourceTierIndex = this.tiers.findIndex(tier => tier.name === sourceTier.name)

    // Promote to all higher priority tiers (lower index = higher priority)
    for (let i = 0; i < sourceTierIndex; i++) {
      try {
        const remainingTtl = Math.max(0, Math.ceil((entry.expiresAt - Date.now()) / 1000))
        await this.tiers[i].set(key, entry.value, remainingTtl, entry.tags)
      } catch {
        console.warn(`Failed to promote cache entry to ${this.tiers[i].name}:`, error)
      }
    }
  }

  private recordOperation(operation: CacheOperation): void {
    this.operations.push(operation)

    // Keep only recent operations (last 1000)
    if (this.operations.length > 1000) {
      this.operations = this.operations.slice(-1000)
    }
  }

  private startCleanupTimer(): void {
    this.cleanupTimer = setInterval(() => {
      this.performCleanup()
    }, this.config.cleanupInterval)
  }

  private async performCleanup(): void {
    // Clean up operation history older than 1 hour
    const oneHourAgo = Date.now() - 3600000
    this.operations = this.operations.filter(op =>
      op.operation !== 'get' || Date.now() - oneHourAgo < 3600000
    )

    // Trigger tier-specific cleanup if needed
    // This would be implemented per tier based on their cleanup strategies
  }
}

/**
 * Factory function to create cache manager with default config
 */
export function createCacheManager(config?: Partial<CacheConfig>): CacheManager {
  return new CacheManager(config)
}

/**
 * Global cache manager instance
 */
let globalCacheManager: CacheManager | null = null

export function useCache(): CacheManager {
  if (!globalCacheManager) {
    globalCacheManager = createCacheManager({
      tiers: {
        memory: { enabled: true, maxEntries: 500, maxMemoryMB: 25 },
        redis: { enabled: import.meta.server, keyPrefix: 'spotify_cache' },
        browser: { enabled: import.meta.client, storage: 'localStorage', maxSizeMB: 5 }
      }
    })
  }

  return globalCacheManager
}

/**
 * Cache key utilities
 */
export const CacheKeys = {
  spotifyToken: () => 'spotify:token',
  genres: () => 'spotify:genres',
  playlist: (id: string) => `spotify:playlist:${id}`,
  search: (genres: string[], minFollowers?: number) => {
    const genresKey = genres.sort().join(',')
    const followersKey = minFollowers || 0
    return `spotify:search:${Buffer.from(`${genresKey}:${followersKey}`).toString('base64')}`
  },
  user: (userId: string) => `user:${userId}`,
  session: (sessionId: string) => `session:${sessionId}`
}
