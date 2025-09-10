/**
 * POST /api/export
 * 
 * Export search results to JSON or CSV format.
 * Supports data transformation and sanitization.
 * 
 * Reference: api-contract.yaml lines 84-116
 */

import { createPlaylistExporter, type ExportOptions } from '~/lib/export-utils'
import { useRateLimiter, createRateLimitMiddleware } from '~/lib/rate-limiter'
import { useErrorHandler, createErrorContext } from '~/lib/error-utils'
import { useValidator, SpotifySchemas, createValidationMiddleware } from '~/lib/validation-utils'
import type { SearchResult } from '~/types'

const rateLimiter = useRateLimiter()
const exporter = createPlaylistExporter()

// Rate limiting middleware (restrictive for export operations)
const rateLimit = createRateLimitMiddleware(rateLimiter, 'export', {
  keyExtractor: (event) => ({
    key: 'export-endpoint',
    ip: getClientIP(event),
    userId: getHeader(event, 'x-user-id') || 'anonymous',
    endpoint: '/api/export',
    method: 'POST',
    timestamp: Date.now()
  })
})

// Validation middleware
const validateRequest = createValidationMiddleware(SpotifySchemas.exportRequest, {
  validateBody: true,
  sanitize: true
})

export default defineEventHandler(async (event) => {
  const startTime = Date.now()
  const requestId = `export_${startTime}_${Math.random().toString(36).substr(2, 9)}`
  
  // Set request headers
  setHeader(event, 'X-Request-ID', requestId)
  
  try {
    // Read and validate request body
    const body = await readBody(event)
    
    // Apply validation
    await validateRequest(event)
    
    // Apply rate limiting
    await rateLimit(event)
    
    const errorHandler = useErrorHandler()
    
    // Extract and validate request data
    const { format, data: searchResult } = body
    
    // Additional validation for search result structure
    if (!searchResult || typeof searchResult !== 'object') {
      throw createError({
        statusCode: 400,
        statusMessage: 'Bad Request',
        data: {
          success: false,
          error: {
            code: 'INVALID_DATA',
            message: 'Export data must be a valid SearchResult object',
            field: 'data'
          },
          requestId
        }
      })
    }
    
    if (!searchResult.playlists || !Array.isArray(searchResult.playlists)) {
      throw createError({
        statusCode: 400,
        statusMessage: 'Bad Request',
        data: {
          success: false,
          error: {
            code: 'MISSING_PLAYLISTS',
            message: 'Export data must contain a playlists array',
            field: 'data.playlists'
          },
          requestId
        }
      })
    }
    
    if (!searchResult.searchMetadata || typeof searchResult.searchMetadata !== 'object') {
      throw createError({
        statusCode: 400,
        statusMessage: 'Bad Request',
        data: {
          success: false,
          error: {
            code: 'MISSING_METADATA',
            message: 'Export data must contain searchMetadata',
            field: 'data.searchMetadata'
          },
          requestId
        }
      })
    }
    
    // Validate playlist count (reasonable limits)
    if (searchResult.playlists.length > 1000) {
      throw createError({
        statusCode: 413,
        statusMessage: 'Payload Too Large',
        data: {
          success: false,
          error: {
            code: 'TOO_MANY_PLAYLISTS',
            message: 'Cannot export more than 1000 playlists at once',
            limit: 1000,
            current: searchResult.playlists.length
          },
          requestId
        }
      })
    }
    
    // Configure export options
    const exportOptions: Partial<ExportOptions> = {
      format: format as 'json' | 'csv',
      includeMetadata: true,
      sanitizeData: true,
      dateFormat: 'iso'
    }
    
    // Add CSV-specific options
    if (format === 'csv') {
      exportOptions.csvOptions = {
        delimiter: ',',
        includeHeaders: true,
        quotedFields: ['name', 'description', 'ownerName', 'genres', 'ownerContact']
      }
    }
    
    // Perform export
    const exportResult = await exporter.exportSearchResults(searchResult as SearchResult, exportOptions)
    
    // Set appropriate content type and headers
    setHeader(event, 'Content-Type', exportResult.contentType)
    setHeader(event, 'Content-Length', exportResult.size.toString())
    setHeader(event, 'X-Export-Checksum', exportResult.checksum)
    setHeader(event, 'X-Response-Time', `${Date.now() - startTime}ms`)
    
    // For JSON format, return structured response
    if (format === 'json') {
      return {
        success: true,
        data: JSON.parse(exportResult.content),
        metadata: {
          format: 'json',
          filename: exportResult.filename,
          size: exportResult.size,
          checksum: exportResult.checksum,
          exportTime: Date.now() - startTime,
          playlistCount: searchResult.playlists.length,
          requestId
        }
      }
    }
    
    // For CSV format, return as downloadable content
    setHeader(event, 'Content-Disposition', `attachment; filename="${exportResult.filename}"`)
    
    return exportResult.content
    
  } catch (error: any) {
    // Handle validation errors
    if (error.statusCode && error.statusCode < 500) {
      setHeader(event, 'X-Response-Time', `${Date.now() - startTime}ms`)
      throw error
    }
    
    const context = createErrorContext('export-data', {
      requestId,
      endpoint: '/api/export',
      method: 'POST',
      ip: getClientIP(event),
      userAgent: getHeader(event, 'user-agent'),
      metadata: { format: body?.format, playlistCount: body?.data?.playlists?.length }
    })
    
    const errorHandler = useErrorHandler()
    const result = await errorHandler.handleError(error, context)
    
    // Export operations are generally not recoverable
    const finalError = result.finalError
    let statusCode = 500
    let errorResponse: any = {
      success: false,
      error: {
        code: finalError.details.code,
        message: finalError.details.userMessage,
        requestId
      },
      metadata: {
        exportTime: Date.now() - startTime,
        requestId
      }
    }
    
    switch (finalError.details.category) {
      case 'validation':
        statusCode = 400
        errorResponse.error.retryable = false
        errorResponse.error.suggestions = finalError.details.suggestedActions
        break
        
      case 'rate_limit':
        statusCode = 429
        errorResponse.error.retryable = true
        errorResponse.error.retryAfter = finalError.details.metadata?.retryAfter || 300
        errorResponse.error.message = 'Export rate limit exceeded. Please wait before trying again.'
        setHeader(event, 'Retry-After', errorResponse.error.retryAfter.toString())
        break
        
      case 'business':
        statusCode = 422
        errorResponse.error.retryable = false
        errorResponse.error.suggestion = 'Please check your export data and try again.'
        break
        
      case 'system':
        statusCode = 500
        errorResponse.error.retryable = true
        errorResponse.error.suggestion = 'Export service is temporarily unavailable. Please try again later.'
        break
        
      default:
        statusCode = 500
        errorResponse.error.retryable = false
        errorResponse.error.suggestion = 'Export failed due to an unexpected error. Please try again or contact support.'
    }
    
    setHeader(event, 'Content-Type', 'application/json')
    setHeader(event, 'X-Response-Time', `${Date.now() - startTime}ms`)
    
    throw createError({
      statusCode,
      statusMessage: finalError.details.userMessage,
      data: errorResponse
    })
  }
})