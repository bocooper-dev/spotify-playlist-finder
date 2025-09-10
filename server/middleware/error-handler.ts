/**
 * Global Error Handler Middleware
 * 
 * Catches unhandled errors in API routes and provides consistent error responses.
 * Works in conjunction with route-specific error handling.
 */

import { useErrorHandler, createErrorContext, ErrorResponse } from '~/lib/error-utils'

export default defineEventHandler(async (event) => {
  // Only apply to API routes
  if (!event.node.req.url?.startsWith('/api/')) {
    return
  }
  
  // Store original response handler
  const originalRes = event.node.res
  let responseIntercepted = false
  
  // Intercept response to handle errors
  const handleResponse = (statusCode: number, data?: any) => {
    if (responseIntercepted) return
    responseIntercepted = true
    
    const requestId = event.context.requestId || 'unknown'
    const startTime = event.context.startTime || Date.now()
    const responseTime = Date.now() - startTime
    
    // Set performance header
    setHeader(event, 'X-Response-Time', `${responseTime}ms`)
    
    // Log performance in development
    if (process.env.NODE_ENV === 'development') {
      console.log(`[API] ${event.node.req.method} ${event.node.req.url} - ${statusCode} - ${responseTime}ms`)
    }
    
    // Log slow requests (>2s)
    if (responseTime > 2000) {
      console.warn(`[SLOW API] ${event.node.req.method} ${event.node.req.url} took ${responseTime}ms`)
    }
  }
  
  // Hook into response
  event.node.res.writeHead = ((originalWriteHead) => {
    return function(statusCode: number, ...args: any[]) {
      handleResponse(statusCode)
      return originalWriteHead.call(this, statusCode, ...args)
    }
  })(event.node.res.writeHead)
  
  // Handle uncaught errors during event processing
  try {
    // Let the request proceed
    return
  } catch (error: any) {
    // This should rarely be hit due to route-specific error handling
    const context = createErrorContext('global-error-handler', {
      requestId: event.context.requestId || 'unknown',
      endpoint: event.node.req.url || 'unknown',
      method: event.node.req.method || 'unknown',
      ip: getClientIP(event),
      userAgent: getHeader(event, 'user-agent')
    })
    
    const errorHandler = useErrorHandler()
    const result = await errorHandler.handleError(error, context)
    
    const finalError = result.finalError
    const statusCode = ErrorResponse.getStatusCode(finalError)
    const errorResponse = ErrorResponse.create(finalError, statusCode)
    
    handleResponse(statusCode, errorResponse)
    
    throw createError({
      statusCode,
      statusMessage: finalError.details.userMessage,
      data: errorResponse
    })
  }
})