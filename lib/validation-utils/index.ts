/**
 * Validation Utilities Library
 * 
 * Provides comprehensive validation functionality for all data types and operations
 * in the Spotify Playlist Discovery System.
 * 
 * Features:
 * - Schema-based validation with TypeScript integration
 * - Custom validation rules and async validators
 * - Sanitization and normalization
 * - Detailed error reporting with field-level feedback
 * - Performance optimized validation chains
 * - Built-in validators for common patterns
 */

import type { SearchRequest, Genre, Playlist, PlaylistOwner } from '~/types'

export interface ValidationRule<T = any> {
  name: string
  message: string
  validate: (value: T, context?: ValidationContext) => boolean | Promise<boolean>
  sanitize?: (value: T) => T
}

export interface ValidationSchema {
  [key: string]: {
    rules: ValidationRule[]
    optional?: boolean
    transform?: (value: any) => any
    nested?: ValidationSchema
  }
}

export interface ValidationContext {
  field: string
  value: any
  object: any
  parent?: ValidationContext
  metadata?: Record<string, any>
}

export interface ValidationError {
  field: string
  message: string
  code: string
  value?: any
  context?: any
}

export interface ValidationResult {
  valid: boolean
  errors: ValidationError[]
  warnings: ValidationError[]
  sanitized?: any
  metadata?: {
    validationTime: number
    rulesApplied: number
    fieldsValidated: number
  }
}

export class ValidationError extends Error {
  constructor(
    public errors: ValidationError[],
    message?: string
  ) {
    super(message || `Validation failed with ${errors.length} errors`)
    this.name = 'ValidationError'
  }
}

/**
 * Core validator class
 */
export class Validator {
  private customRules = new Map<string, ValidationRule>()
  private cache = new Map<string, ValidationResult>()
  
  /**
   * Add custom validation rule
   */
  addRule<T>(name: string, rule: Omit<ValidationRule<T>, 'name'>): void {
    this.customRules.set(name, { name, ...rule })
  }
  
  /**
   * Validate data against schema
   */
  async validate(
    data: any,
    schema: ValidationSchema,
    options: {
      stopOnFirstError?: boolean
      enableCache?: boolean
      sanitize?: boolean
    } = {}
  ): Promise<ValidationResult> {
    const startTime = Date.now()
    let rulesApplied = 0
    let fieldsValidated = 0
    
    // Check cache if enabled
    if (options.enableCache) {
      const cacheKey = this.generateCacheKey(data, schema)
      const cached = this.cache.get(cacheKey)
      if (cached) return cached
    }
    
    const errors: ValidationError[] = []
    const warnings: ValidationError[] = []
    const sanitized: any = options.sanitize ? {} : undefined
    
    for (const [field, fieldSchema] of Object.entries(schema)) {
      fieldsValidated++
      const value = data[field]
      
      // Check if field is optional and missing
      if (fieldSchema.optional && (value === undefined || value === null)) {
        continue
      }
      
      // Check if required field is missing
      if (!fieldSchema.optional && (value === undefined || value === null)) {
        errors.push({
          field,
          message: `Field '${field}' is required`,
          code: 'REQUIRED_FIELD_MISSING',
          value
        })
        
        if (options.stopOnFirstError) break
        continue
      }
      
      // Transform value if transformer provided
      let transformedValue = value
      if (fieldSchema.transform) {
        try {
          transformedValue = fieldSchema.transform(value)
        } catch (error: any) {
          errors.push({
            field,
            message: `Field transformation failed: ${error.message}`,
            code: 'TRANSFORMATION_FAILED',
            value
          })
          continue
        }
      }
      
      // Apply validation rules
      const context: ValidationContext = {
        field,
        value: transformedValue,
        object: data
      }
      
      for (const rule of fieldSchema.rules) {
        rulesApplied++
        
        try {
          const isValid = await rule.validate(transformedValue, context)
          
          if (!isValid) {
            errors.push({
              field,
              message: rule.message,
              code: rule.name.toUpperCase(),
              value: transformedValue
            })
            
            if (options.stopOnFirstError) break
          } else if (rule.sanitize && options.sanitize) {
            transformedValue = rule.sanitize(transformedValue)
          }
        } catch (error: any) {
          errors.push({
            field,
            message: `Validation rule '${rule.name}' failed: ${error.message}`,
            code: 'RULE_EXECUTION_FAILED',
            value: transformedValue,
            context: error
          })
        }
      }
      
      // Handle nested validation
      if (fieldSchema.nested && typeof transformedValue === 'object') {
        const nestedResult = await this.validate(
          transformedValue,
          fieldSchema.nested,
          options
        )
        
        // Prefix nested errors with parent field name
        for (const error of nestedResult.errors) {
          errors.push({
            ...error,
            field: `${field}.${error.field}`
          })
        }
        
        for (const warning of nestedResult.warnings) {
          warnings.push({
            ...warning,
            field: `${field}.${warning.field}`
          })
        }
        
        if (options.sanitize && nestedResult.sanitized) {
          sanitized[field] = nestedResult.sanitized
        }
      } else if (options.sanitize) {
        sanitized[field] = transformedValue
      }
      
      if (options.stopOnFirstError && errors.length > 0) break
    }
    
    const result: ValidationResult = {
      valid: errors.length === 0,
      errors,
      warnings,
      ...(options.sanitize && { sanitized }),
      metadata: {
        validationTime: Date.now() - startTime,
        rulesApplied,
        fieldsValidated
      }
    }
    
    // Cache result if enabled
    if (options.enableCache) {
      const cacheKey = this.generateCacheKey(data, schema)
      this.cache.set(cacheKey, result)
    }
    
    return result
  }
  
  /**
   * Quick validation that throws on error
   */
  async validateAndThrow(
    data: any,
    schema: ValidationSchema,
    options: Parameters<typeof this.validate>[2] = {}
  ): Promise<any> {
    const result = await this.validate(data, schema, options)
    
    if (!result.valid) {
      throw new ValidationError(result.errors)
    }
    
    return result.sanitized || data
  }
  
  private generateCacheKey(data: any, schema: ValidationSchema): string {
    const dataHash = JSON.stringify(data)
    const schemaHash = JSON.stringify(schema)
    return Buffer.from(dataHash + schemaHash).toString('base64')
  }
}

/**
 * Built-in validation rules
 */
export const Rules = {
  // String validation
  string: (options: { minLength?: number; maxLength?: number; pattern?: RegExp } = {}): ValidationRule<string> => ({
    name: 'string',
    message: 'Must be a string',
    validate: (value) => typeof value === 'string' &&
      (options.minLength === undefined || value.length >= options.minLength) &&
      (options.maxLength === undefined || value.length <= options.maxLength) &&
      (options.pattern === undefined || options.pattern.test(value)),
    sanitize: (value) => String(value).trim()
  }),
  
  // Number validation
  number: (options: { min?: number; max?: number; integer?: boolean } = {}): ValidationRule<number> => ({
    name: 'number',
    message: 'Must be a valid number',
    validate: (value) => {
      const num = typeof value === 'string' ? parseFloat(value) : value
      return !isNaN(num) &&
        (options.min === undefined || num >= options.min) &&
        (options.max === undefined || num <= options.max) &&
        (!options.integer || Number.isInteger(num))
    },
    sanitize: (value) => typeof value === 'string' ? parseFloat(value) : value
  }),
  
  // Array validation
  array: (options: { minLength?: number; maxLength?: number; itemValidator?: ValidationRule } = {}): ValidationRule<any[]> => ({
    name: 'array',
    message: 'Must be an array',
    validate: async (value) => {
      if (!Array.isArray(value)) return false
      
      if (options.minLength !== undefined && value.length < options.minLength) return false
      if (options.maxLength !== undefined && value.length > options.maxLength) return false
      
      if (options.itemValidator) {
        for (const item of value) {
          const isValid = await options.itemValidator.validate(item)
          if (!isValid) return false
        }
      }
      
      return true
    },
    sanitize: (value) => Array.isArray(value) ? value : []
  }),
  
  // Email validation
  email: (): ValidationRule<string> => ({
    name: 'email',
    message: 'Must be a valid email address',
    validate: (value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value),
    sanitize: (value) => String(value).toLowerCase().trim()
  }),
  
  // URL validation
  url: (options: { protocols?: string[] } = {}): ValidationRule<string> => ({
    name: 'url',
    message: 'Must be a valid URL',
    validate: (value) => {
      try {
        const url = new URL(value)
        if (options.protocols && !options.protocols.includes(url.protocol.replace(':', ''))) {
          return false
        }
        return true
      } catch {
        return false
      }
    },
    sanitize: (value) => {
      try {
        return new URL(value).toString()
      } catch {
        return value
      }
    }
  }),
  
  // Date validation
  date: (options: { min?: Date; max?: Date } = {}): ValidationRule<string | Date> => ({
    name: 'date',
    message: 'Must be a valid date',
    validate: (value) => {
      const date = new Date(value)
      if (isNaN(date.getTime())) return false
      
      if (options.min && date < options.min) return false
      if (options.max && date > options.max) return false
      
      return true
    },
    sanitize: (value) => new Date(value).toISOString()
  }),
  
  // Enum validation
  enum: <T>(values: T[]): ValidationRule<T> => ({
    name: 'enum',
    message: `Must be one of: ${values.join(', ')}`,
    validate: (value) => values.includes(value)
  }),
  
  // Custom async validation
  async: <T>(
    validator: (value: T, context?: ValidationContext) => Promise<boolean>,
    message: string = 'Validation failed'
  ): ValidationRule<T> => ({
    name: 'async',
    message,
    validate: validator
  }),
  
  // Conditional validation
  when: <T>(
    condition: (value: T, context?: ValidationContext) => boolean,
    rule: ValidationRule<T>
  ): ValidationRule<T> => ({
    name: 'conditional',
    message: rule.message,
    validate: (value, context) => {
      if (!condition(value, context)) return true
      return rule.validate(value, context)
    },
    sanitize: rule.sanitize
  })
}

/**
 * Spotify-specific validation schemas
 */
export const SpotifySchemas = {
  searchRequest: {
    genres: {
      rules: [
        Rules.array({ minLength: 1, maxLength: 10 }),
        Rules.async(async (genres: string[]) => {
          // Validate all genres are strings and not empty
          return genres.every(genre => typeof genre === 'string' && genre.trim().length > 0)
        }, 'All genres must be non-empty strings')
      ]
    },
    minFollowers: {
      rules: [Rules.number({ min: 0, max: 100000000, integer: true })],
      optional: true,
      transform: (value: any) => value ? parseInt(value, 10) : undefined
    },
    maxFollowers: {
      rules: [Rules.number({ min: 0, max: 100000000, integer: true })],
      optional: true,
      transform: (value: any) => value ? parseInt(value, 10) : undefined
    },
    market: {
      rules: [
        Rules.string({ minLength: 2, maxLength: 2, pattern: /^[A-Z]{2}$/ })
      ],
      optional: true,
      transform: (value: string) => value?.toUpperCase()
    },
    enhanceWithScraping: {
      rules: [Rules.enum([true, false])],
      optional: true,
      transform: (value: any) => Boolean(value)
    }
  } as ValidationSchema,
  
  playlistId: {
    id: {
      rules: [
        Rules.string({ minLength: 22, maxLength: 22, pattern: /^[0-9A-Za-z]{22}$/ }),
        Rules.async(async (id: string) => {
          // Additional validation: ensure it's not a blacklisted ID
          const blacklist = ['0000000000000000000000', '1111111111111111111111']
          return !blacklist.includes(id)
        }, 'Invalid playlist ID')
      ]
    }
  } as ValidationSchema,
  
  exportRequest: {
    format: {
      rules: [Rules.enum(['json', 'csv'])]
    },
    data: {
      rules: [
        Rules.async(async (data: any) => {
          return data && typeof data === 'object' && 
                 data.playlists && Array.isArray(data.playlists) &&
                 data.searchMetadata && typeof data.searchMetadata === 'object'
        }, 'Data must be a valid SearchResult object')
      ]
    }
  } as ValidationSchema,
  
  genre: {
    name: {
      rules: [
        Rules.string({ minLength: 1, maxLength: 50 }),
        Rules.async(async (name: string) => {
          // Validate against known Spotify genres (simplified check)
          const validPattern = /^[a-z0-9-]+$/
          return validPattern.test(name.toLowerCase())
        }, 'Genre name contains invalid characters')
      ],
      transform: (value: string) => value.toLowerCase().trim()
    },
    displayName: {
      rules: [Rules.string({ minLength: 1, maxLength: 100 })],
      optional: true
    },
    relatedGenres: {
      rules: [Rules.array({ maxLength: 10 })],
      optional: true
    }
  } as ValidationSchema
}

/**
 * Validation middleware for API routes
 */
export function createValidationMiddleware(
  schema: ValidationSchema,
  options: {
    validateBody?: boolean
    validateQuery?: boolean
    validateParams?: boolean
    sanitize?: boolean
  } = {}
) {
  return async (event: any) => {
    const validator = new Validator()
    const errors: ValidationError[] = []
    
    // Validate request body
    if (options.validateBody && event.body) {
      try {
        const result = await validator.validate(event.body, schema, {
          sanitize: options.sanitize
        })
        
        if (!result.valid) {
          errors.push(...result.errors)
        } else if (result.sanitized) {
          event.body = result.sanitized
        }
      } catch (error: any) {
        errors.push({
          field: 'body',
          message: `Body validation failed: ${error.message}`,
          code: 'BODY_VALIDATION_FAILED'
        })
      }
    }
    
    // Validate query parameters
    if (options.validateQuery && event.query) {
      try {
        const result = await validator.validate(event.query, schema, {
          sanitize: options.sanitize
        })
        
        if (!result.valid) {
          errors.push(...result.errors.map(err => ({
            ...err,
            field: `query.${err.field}`
          })))
        } else if (result.sanitized) {
          event.query = result.sanitized
        }
      } catch (error: any) {
        errors.push({
          field: 'query',
          message: `Query validation failed: ${error.message}`,
          code: 'QUERY_VALIDATION_FAILED'
        })
      }
    }
    
    // Validate route parameters
    if (options.validateParams && event.params) {
      try {
        const result = await validator.validate(event.params, schema, {
          sanitize: options.sanitize
        })
        
        if (!result.valid) {
          errors.push(...result.errors.map(err => ({
            ...err,
            field: `params.${err.field}`
          })))
        } else if (result.sanitized) {
          event.params = result.sanitized
        }
      } catch (error: any) {
        errors.push({
          field: 'params',
          message: `Params validation failed: ${error.message}`,
          code: 'PARAMS_VALIDATION_FAILED'
        })
      }
    }
    
    // Throw validation error if any errors found
    if (errors.length > 0) {
      throw createError({
        statusCode: 400,
        statusMessage: 'Validation Error',
        data: {
          code: 'VALIDATION_FAILED',
          message: 'Request validation failed',
          errors: errors.map(err => ({
            field: err.field,
            message: err.message,
            code: err.code
          }))
        }
      })
    }
  }
}

/**
 * Client-side validation utilities
 */
export class ClientValidator {
  private static validator = new Validator()
  
  /**
   * Validate search form data
   */
  static async validateSearchForm(data: any): Promise<{
    valid: boolean
    errors: Record<string, string>
    sanitized?: any
  }> {
    try {
      const result = await this.validator.validate(
        data,
        SpotifySchemas.searchRequest,
        { sanitize: true }
      )
      
      const errors: Record<string, string> = {}
      for (const error of result.errors) {
        errors[error.field] = error.message
      }
      
      return {
        valid: result.valid,
        errors,
        sanitized: result.sanitized
      }
    } catch (error: any) {
      return {
        valid: false,
        errors: { general: error.message }
      }
    }
  }
  
  /**
   * Validate export options
   */
  static async validateExportOptions(data: any): Promise<{
    valid: boolean
    errors: Record<string, string>
  }> {
    try {
      const result = await this.validator.validate(
        data,
        SpotifySchemas.exportRequest
      )
      
      const errors: Record<string, string> = {}
      for (const error of result.errors) {
        errors[error.field] = error.message
      }
      
      return { valid: result.valid, errors }
    } catch (error: any) {
      return {
        valid: false,
        errors: { general: error.message }
      }
    }
  }
  
  /**
   * Real-time field validation
   */
  static async validateField(
    fieldName: string,
    value: any,
    schema: ValidationSchema
  ): Promise<{ valid: boolean; message?: string }> {
    const fieldSchema = schema[fieldName]
    if (!fieldSchema) {
      return { valid: true }
    }
    
    try {
      const context: ValidationContext = {
        field: fieldName,
        value,
        object: { [fieldName]: value }
      }
      
      for (const rule of fieldSchema.rules) {
        const isValid = await rule.validate(value, context)
        if (!isValid) {
          return {
            valid: false,
            message: rule.message
          }
        }
      }
      
      return { valid: true }
    } catch (error: any) {
      return {
        valid: false,
        message: `Validation error: ${error.message}`
      }
    }
  }
}

/**
 * Sanitization utilities
 */
export const Sanitizers = {
  /**
   * Sanitize HTML content
   */
  html: (value: string): string => {
    return value
      .replace(/[<>]/g, '') // Remove HTML tags
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#x27;')
      .trim()
  },
  
  /**
   * Sanitize search query
   */
  searchQuery: (value: string): string => {
    return value
      .toLowerCase()
      .trim()
      .replace(/[^\w\s-]/g, '') // Keep only alphanumeric, spaces, and hyphens
      .replace(/\s+/g, ' ') // Normalize whitespace
      .substring(0, 100) // Limit length
  },
  
  /**
   * Sanitize genre name
   */
  genreName: (value: string): string => {
    return value
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9-]/g, '') // Keep only lowercase letters, numbers, and hyphens
      .replace(/-+/g, '-') // Remove duplicate hyphens
      .replace(/^-|-$/g, '') // Remove leading/trailing hyphens
  },
  
  /**
   * Sanitize filename
   */
  filename: (value: string): string => {
    return value
      .replace(/[<>:"/\\|?*]/g, '') // Remove invalid filename characters
      .replace(/\s+/g, '_') // Replace spaces with underscores
      .substring(0, 255) // Limit length
  },
  
  /**
   * Sanitize user input
   */
  userInput: (value: string): string => {
    return value
      .trim()
      .replace(/[\u0000-\u001F\u007F]/g, '') // Remove control characters
      .substring(0, 1000) // Limit length
  }
}

/**
 * Factory functions
 */
export function createValidator(): Validator {
  return new Validator()
}

export function createSpotifyValidator(): Validator {
  const validator = new Validator()
  
  // Add Spotify-specific custom rules
  validator.addRule('spotify-playlist-id', {
    message: 'Must be a valid Spotify playlist ID',
    validate: (value: string) => /^[0-9A-Za-z]{22}$/.test(value),
    sanitize: (value: string) => value.replace(/[^0-9A-Za-z]/g, '').substring(0, 22)
  })
  
  validator.addRule('spotify-market-code', {
    message: 'Must be a valid ISO 3166-1 alpha-2 country code',
    validate: (value: string) => /^[A-Z]{2}$/.test(value),
    sanitize: (value: string) => value.toUpperCase().substring(0, 2)
  })
  
  return validator
}

/**
 * Global validator instance
 */
let globalValidator: Validator | null = null

export function useValidator(): Validator {
  if (!globalValidator) {
    globalValidator = createSpotifyValidator()
  }
  
  return globalValidator
}