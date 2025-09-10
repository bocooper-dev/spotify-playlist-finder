/**
 * Error Handling Utilities Library
 *
 * Provides comprehensive error handling, classification, reporting, and recovery
 * mechanisms for the Spotify Playlist Discovery System.
 *
 * Features:
 * - Structured error classification and handling
 * - Error recovery strategies and retry logic
 * - Performance monitoring and error tracking
 * - User-friendly error messages and suggestions
 * - Integration with logging and monitoring systems
 * - Circuit breaker patterns for resilience
 */

export interface ErrorContext {
  operation: string
  userId?: string
  sessionId?: string
  requestId?: string
  timestamp: number
  userAgent?: string
  ip?: string
  endpoint?: string
  method?: string
  metadata?: Record<string, any>
}

export interface ErrorDetails {
  code: string
  message: string
  severity: 'low' | 'medium' | 'high' | 'critical'
  category: 'validation' | 'network' | 'auth' | 'rate_limit' | 'api' | 'system' | 'business'
  retryable: boolean
  userMessage: string
  suggestedActions: string[]
  context?: ErrorContext
  cause?: Error
  stack?: string
  metadata?: Record<string, any>
}

export interface ErrorRecoveryStrategy {
  name: string
  canRecover: (error: AppError) => boolean
  recover: (error: AppError, context: ErrorContext) => Promise<any>
  maxAttempts: number
  backoffDelay: number
}

export interface ErrorMetrics {
  totalErrors: number
  errorsByType: Record<string, number>
  errorsBySeverity: Record<string, number>
  errorsByEndpoint: Record<string, number>
  recoverySuccess: number
  recoveryFailures: number
  averageRecoveryTime: number
  circuitBreakerTrips: number
}

/**
 * Base application error class
 */
export class AppError extends Error {
  public readonly details: ErrorDetails
  public readonly context?: ErrorContext
  public readonly timestamp: number
  public recoveryAttempts = 0

  constructor(details: Partial<ErrorDetails> & { message: string }) {
    super(details.message)
    this.name = 'AppError'
    this.timestamp = Date.now()

    this.details = {
      code: details.code || 'UNKNOWN_ERROR',
      message: details.message,
      severity: details.severity || 'medium',
      category: details.category || 'system',
      retryable: details.retryable ?? false,
      userMessage: details.userMessage || 'An unexpected error occurred',
      suggestedActions: details.suggestedActions || [],
      context: details.context,
      cause: details.cause,
      stack: details.stack || this.stack,
      metadata: details.metadata || {}
    }

    this.context = details.context
  }

  /**
   * Convert to JSON for logging/transmission
   */
  toJSON(): object {
    return {
      name: this.name,
      message: this.message,
      details: this.details,
      context: this.context,
      timestamp: this.timestamp,
      recoveryAttempts: this.recoveryAttempts
    }
  }

  /**
   * Create user-friendly error response
   */
  toUserResponse(): {
    error: {
      code: string
      message: string
      suggestions: string[]
      retryable: boolean
    }
    requestId?: string
  } {
    return {
      error: {
        code: this.details.code,
        message: this.details.userMessage,
        suggestions: this.details.suggestedActions,
        retryable: this.details.retryable
      },
      requestId: this.context?.requestId
    }
  }
}

/**
 * Specific error types
 */
export class ValidationError extends AppError {
  constructor(message: string, field?: string, value?: unknown) {
    super({
      message,
      code: 'VALIDATION_ERROR',
      category: 'validation',
      severity: 'low',
      userMessage: `Invalid input: ${message}`,
      suggestedActions: ['Check your input and try again'],
      retryable: false,
      metadata: { field, value }
    })
  }
}

export class NetworkError extends AppError {
  constructor(message: string, endpoint?: string, statusCode?: number) {
    super({
      message,
      code: 'NETWORK_ERROR',
      category: 'network',
      severity: statusCode && statusCode >= 500 ? 'high' : 'medium',
      userMessage: 'Network connection failed. Please check your internet connection.',
      suggestedActions: ['Check your internet connection', 'Try again in a moment'],
      retryable: true,
      metadata: { endpoint, statusCode }
    })
  }
}

export class AuthenticationError extends AppError {
  constructor(message: string, reason?: string) {
    super({
      message,
      code: 'AUTH_ERROR',
      category: 'auth',
      severity: 'medium',
      userMessage: 'Authentication failed. Please refresh the page.',
      suggestedActions: ['Refresh the page', 'Clear browser cache'],
      retryable: true,
      metadata: { reason }
    })
  }
}

export class RateLimitError extends AppError {
  constructor(message: string, retryAfter?: number, limit?: number) {
    super({
      message,
      code: 'RATE_LIMIT_ERROR',
      category: 'rate_limit',
      severity: 'medium',
      userMessage: 'Too many requests. Please wait a moment before trying again.',
      suggestedActions: [
        retryAfter ? `Wait ${retryAfter} seconds before trying again` : 'Wait a moment before trying again'
      ],
      retryable: true,
      metadata: { retryAfter, limit }
    })
  }
}

export class SpotifyApiError extends AppError {
  constructor(message: string, statusCode?: number, spotifyError?: unknown) {
    super({
      message,
      code: 'SPOTIFY_API_ERROR',
      category: 'api',
      severity: statusCode && statusCode >= 500 ? 'high' : 'medium',
      userMessage: 'Spotify service is temporarily unavailable. Please try again later.',
      suggestedActions: ['Try again in a few minutes', 'Check Spotify service status'],
      retryable: statusCode !== 400 && statusCode !== 403,
      metadata: { statusCode, spotifyError }
    })
  }
}

export class BusinessLogicError extends AppError {
  constructor(message: string, operation: string) {
    super({
      message,
      code: 'BUSINESS_LOGIC_ERROR',
      category: 'business',
      severity: 'low',
      userMessage: message,
      suggestedActions: ['Please review your request and try again'],
      retryable: false,
      metadata: { operation }
    })
  }
}

/**
 * Error recovery strategies
 */
export const RecoveryStrategies: ErrorRecoveryStrategy[] = [
  {
    name: 'token-refresh',
    canRecover: error => error.details.category === 'auth',
    recover: async (error, context) => {
      // Attempt to refresh authentication token
      try {
        const response = await $fetch('/api/auth/refresh', {
          method: 'POST',
          headers: { 'X-Request-ID': context.requestId }
        })
        return response
      } catch (refreshError) {
        throw new AuthenticationError('Token refresh failed')
      }
    },
    maxAttempts: 2,
    backoffDelay: 1000
  },

  {
    name: 'rate-limit-backoff',
    canRecover: error => error.details.category === 'rate_limit',
    recover: async (error, context) => {
      const retryAfter = error.details.metadata?.retryAfter || 1000
      await new Promise(resolve => setTimeout(resolve, retryAfter))
      return { recovered: true, delay: retryAfter }
    },
    maxAttempts: 3,
    backoffDelay: 1000
  },

  {
    name: 'network-retry',
    canRecover: error => error.details.category === 'network' && error.details.retryable,
    recover: async (error, context) => {
      // Exponential backoff for network errors
      const attempt = error.recoveryAttempts + 1
      const delay = Math.min(1000 * Math.pow(2, attempt), 10000)
      await new Promise(resolve => setTimeout(resolve, delay))
      return { recovered: true, delay }
    },
    maxAttempts: 3,
    backoffDelay: 1000
  },

  {
    name: 'api-fallback',
    canRecover: error => error.details.category === 'api',
    recover: async (error, context) => {
      // Attempt to use cached data or alternative endpoints
      try {
        if (context.operation === 'search-playlists') {
          // Try to return cached results
          const cache = useCache()
          const cacheKey = `fallback_${context.operation}_${context.requestId}`
          const cached = await cache.get(cacheKey)

          if (cached) {
            return { data: cached, fromCache: true }
          }
        }

        throw new Error('No fallback available')
      } catch (fallbackError) {
        throw new AppError({
          message: 'Service temporarily unavailable',
          code: 'SERVICE_UNAVAILABLE',
          category: 'api',
          severity: 'high',
          userMessage: 'Service is temporarily unavailable. Please try again later.',
          suggestedActions: ['Try again in a few minutes'],
          retryable: true
        })
      }
    },
    maxAttempts: 1,
    backoffDelay: 0
  }
]

/**
 * Error handler class
 */
export class ErrorHandler {
  private recoveryStrategies: ErrorRecoveryStrategy[] = []
  private metrics: ErrorMetrics = {
    totalErrors: 0,
    errorsByType: {},
    errorsBySeverity: {},
    errorsByEndpoint: {},
    recoverySuccess: 0,
    recoveryFailures: 0,
    averageRecoveryTime: 0,
    circuitBreakerTrips: 0
  }

  constructor() {
    this.recoveryStrategies = [...RecoveryStrategies]
  }

  /**
   * Handle error with recovery attempts
   */
  async handleError(error: Error | AppError, context: ErrorContext): Promise<{
    recovered: boolean
    result?: unknown
    finalError: AppError
  }> {
    const appError = this.normalizeError(error, context)
    this.updateMetrics(appError)

    // Log error
    await this.logError(appError, context)

    // Attempt recovery if error is retryable
    if (appError.details.retryable && appError.recoveryAttempts < 3) {
      const recoveryResult = await this.attemptRecovery(appError, context)

      if (recoveryResult.success) {
        this.metrics.recoverySuccess++
        return {
          recovered: true,
          result: recoveryResult.result,
          finalError: appError
        }
      } else {
        this.metrics.recoveryFailures++
      }
    }

    return {
      recovered: false,
      finalError: appError
    }
  }

  /**
   * Attempt error recovery using available strategies
   */
  private async attemptRecovery(error: AppError, context: ErrorContext): Promise<{
    success: boolean
    result?: unknown
    strategy?: string
  }> {
    const startTime = Date.now()

    for (const strategy of this.recoveryStrategies) {
      if (strategy.canRecover(error) && error.recoveryAttempts < strategy.maxAttempts) {
        try {
          error.recoveryAttempts++

          const result = await strategy.recover(error, context)

          // Update recovery time metrics
          const recoveryTime = Date.now() - startTime
          this.updateRecoveryTime(recoveryTime)

          return {
            success: true,
            result,
            strategy: strategy.name
          }
        } catch (recoveryerror) {
          console.warn(`Recovery strategy '${strategy.name}' failed:`, recoveryError.message)
          continue
        }
      }
    }

    return { success: false }
  }

  /**
   * Normalize any error to AppError
   */
  private normalizeError(error: Error | AppError, context: ErrorContext): AppError {
    if (error instanceof AppError) {
      if (!error.context) {
        error.details.context = context
      }
      return error
    }

    // Convert common error types
    if (error.message.includes('fetch failed') || error.message.includes('network')) {
      return new NetworkError(error.message, context.endpoint)
    }

    if (error.message.includes('401') || error.message.includes('unauthorized')) {
      return new AuthenticationError(error.message)
    }

    if (error.message.includes('429') || error.message.includes('rate limit')) {
      return new RateLimitError(error.message)
    }

    // Generic error fallback
    return new AppError({
      message: error.message,
      code: 'UNKNOWN_ERROR',
      category: 'system',
      severity: 'medium',
      userMessage: 'An unexpected error occurred',
      suggestedActions: ['Try refreshing the page'],
      retryable: false,
      context,
      cause: error,
      stack: error.stack
    })
  }

  /**
   * Log error to appropriate channels
   */
  private async logError(error: AppError, context: ErrorContext): Promise<void> {
    const logData = {
      error: error.toJSON(),
      context,
      timestamp: new Date().toISOString(),
      environment: process.env.NODE_ENV || 'development'
    }

    // Console logging (always)
    console.error(`[${error.details.severity.toUpperCase()}] ${error.details.code}:`, logData)

    // High/Critical errors get additional logging
    if (error.details.severity === 'high' || error.details.severity === 'critical') {
      try {
        // Send to external logging service (placeholder)
        await this.sendToExternalLogging(logData)
      } catch (loggingError) {
        console.warn('External logging failed:', loggingError)
      }
    }
  }

  /**
   * Send error to external logging service
   */
  private async sendToExternalLogging(logData: unknown): Promise<void> {
    // Placeholder for external logging integration
    // In production, this would integrate with services like:
    // - Sentry, DataDog, LogRocket, etc.
    // - Custom logging endpoints
    // - Slack/Discord webhooks for critical errors

    try {
      if (process.env.ERROR_WEBHOOK_URL) {
        await $fetch(process.env.ERROR_WEBHOOK_URL, {
          method: 'POST',
          body: logData,
          headers: {
            'Content-Type': 'application/json'
          }
        })
      }
    } catch (error) {
      console.warn('Failed to send error to webhook:', error)
    }
  }

  /**
   * Update error metrics
   */
  private updateMetrics(error: AppError): void {
    this.metrics.totalErrors++

    // Update by type
    const errorType = error.details.code
    this.metrics.errorsByType[errorType] = (this.metrics.errorsByType[errorType] || 0) + 1

    // Update by severity
    const severity = error.details.severity
    this.metrics.errorsBySeverity[severity] = (this.metrics.errorsBySeverity[severity] || 0) + 1

    // Update by endpoint
    if (error.context?.endpoint) {
      const endpoint = error.context.endpoint
      this.metrics.errorsByEndpoint[endpoint] = (this.metrics.errorsByEndpoint[endpoint] || 0) + 1
    }
  }

  /**
   * Update recovery time metrics
   */
  private updateRecoveryTime(recoveryTime: number): void {
    const totalRecoveries = this.metrics.recoverySuccess + this.metrics.recoveryFailures
    const currentAverage = this.metrics.averageRecoveryTime

    this.metrics.averageRecoveryTime = totalRecoveries > 0
      ? (currentAverage * (totalRecoveries - 1) + recoveryTime) / totalRecoveries
      : recoveryTime
  }

  /**
   * Get current error metrics
   */
  getMetrics(): ErrorMetrics {
    return { ...this.metrics }
  }

  /**
   * Reset metrics
   */
  resetMetrics(): void {
    this.metrics = {
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

  /**
   * Add custom recovery strategy
   */
  addRecoveryStrategy(strategy: ErrorRecoveryStrategy): void {
    this.recoveryStrategies.push(strategy)
  }
}

/**
 * Error boundary for catching unhandled errors
 */
export class ErrorBoundary {
  private handler: ErrorHandler

  constructor(handler?: ErrorHandler) {
    this.handler = handler || new ErrorHandler()
    this.setupGlobalHandlers()
  }

  /**
   * Setup global error handlers
   */
  private setupGlobalHandlers(): void {
    // Unhandled promise rejections
    if (import.meta.client) {
      window.addEventListener('unhandledrejection', (event) => {
        const error = event.reason
        const context: ErrorContext = {
          operation: 'unhandled-promise',
          timestamp: Date.now(),
          userAgent: navigator.userAgent,
          endpoint: window.location.pathname
        }

        this.handler.handleError(error, context)
        event.preventDefault()
      })

      // Global error handler
      window.addEventListener('error', (event) => {
        const error = event.error || new Error(event.message)
        const context: ErrorContext = {
          operation: 'global-error',
          timestamp: Date.now(),
          userAgent: navigator.userAgent,
          endpoint: window.location.pathname
        }

        this.handler.handleError(error, context)
      })
    }

    // Node.js process handlers
    if (import.meta.server) {
      process.on('uncaughtException', (error) => {
        const context: ErrorContext = {
          operation: 'uncaught-exception',
          timestamp: Date.now()
        }

        this.handler.handleError(error, context)

        // In production, you might want to exit gracefully
        if (process.env.NODE_ENV === 'production') {
          setTimeout(() => process.exit(1), 1000)
        }
      })

      process.on('unhandledRejection', (reason, promise) => {
        const error = reason instanceof Error ? reason : new Error(String(reason))
        const context: ErrorContext = {
          operation: 'unhandled-rejection',
          timestamp: Date.now(),
          metadata: { promise: promise.toString() }
        }

        this.handler.handleError(error, context)
      })
    }
  }
}

/**
 * Error utilities for API responses
 */
export const ErrorResponse = {
  /**
   * Create standardized error response
   */
  create(error: AppError, statusCode?: number): object {
    const response = error.toUserResponse()

    return {
      success: false,
      ...response,
      timestamp: new Date().toISOString(),
      statusCode: statusCode || this.getStatusCode(error)
    }
  },

  /**
   * Get appropriate HTTP status code for error
   */
  getStatusCode(error: AppError): number {
    switch (error.details.category) {
      case 'validation':
        return 400
      case 'auth':
        return 401
      case 'rate_limit':
        return 429
      case 'business':
        return 422
      case 'network':
      case 'api':
        return error.details.metadata?.statusCode || 503
      default:
        return 500
    }
  }
}

/**
 * Utility functions
 */
export function createErrorContext(
  operation: string,
  additionalContext?: Partial<ErrorContext>
): ErrorContext {
  return {
    operation,
    timestamp: Date.now(),
    requestId: Math.random().toString(36).substring(2, 15),
    ...additionalContext
  }
}

export function isRetryableError(error: Error | AppError): boolean {
  if (error instanceof AppError) {
    return error.details.retryable
  }

  // Check common retryable error patterns
  const retryablePatterns = [
    /network/i,
    /timeout/i,
    /503/,
    /502/,
    /500/,
    /429/,
    /rate.*limit/i
  ]

  return retryablePatterns.some(pattern => pattern.test(error.message))
}

/**
 * Global error handler instance
 */
let globalErrorHandler: ErrorHandler | null = null
let globalErrorBoundary: ErrorBoundary | null = null

export function useErrorHandler(): ErrorHandler {
  if (!globalErrorHandler) {
    globalErrorHandler = new ErrorHandler()
  }

  return globalErrorHandler
}

export function useErrorBoundary(): ErrorBoundary {
  if (!globalErrorBoundary) {
    globalErrorBoundary = new ErrorBoundary()
  }

  return globalErrorBoundary
}

/**
 * Composable for Vue/Nuxt error handling
 */
export function useAppError() {
  const errorHandler = useErrorHandler()

  const handleError = async (error: Error | AppError, operation: string) => {
    const context = createErrorContext(operation, {
      // Add Nuxt-specific context
      endpoint: useRoute().path,
      userId: 'anonymous' // Would get from auth state
    })

    const result = await errorHandler.handleError(error, context)

    if (!result.recovered) {
      // Show user-friendly error message
      const errorResponse = ErrorResponse.create(result.finalError)
      throw createError({
        statusCode: ErrorResponse.getStatusCode(result.finalError),
        statusMessage: result.finalError.details.userMessage,
        data: errorResponse
      })
    }

    return result.result
  }

  const createBusinessError = (message: string, operation: string) => {
    return new BusinessLogicError(message, operation)
  }

  const createValidationError = (message: string, field?: string, value?: unknown) => {
    return new ValidationError(message, field, value)
  }

  return {
    handleError,
    createBusinessError,
    createValidationError,
    getMetrics: () => errorHandler.getMetrics()
  }
}
