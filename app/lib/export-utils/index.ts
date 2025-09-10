/**
 * Export Utilities Library
 * 
 * Provides comprehensive data export functionality for playlist search results.
 * Supports multiple formats with data transformation and validation.
 * 
 * Features:
 * - JSON and CSV export formats
 * - Data sanitization and formatting
 * - Metadata generation
 * - Type-safe transformations
 * - File generation utilities
 */

import type { SearchResult, ExportData, ExportPlaylist } from '~/types'

export interface ExportOptions {
  format: 'json' | 'csv'
  includeMetadata: boolean
  sanitizeData: boolean
  filename?: string
  dateFormat?: 'iso' | 'human'
  csvOptions?: {
    delimiter: string
    includeHeaders: boolean
    quotedFields: string[]
  }
}

export interface ExportResult {
  content: string
  contentType: string
  filename: string
  size: number
  checksum: string
}

export interface ExportMetrics {
  exportTime: number
  recordsProcessed: number
  fieldsIncluded: number
  dataSize: number
  compressionRatio?: number
}

export class ExportError extends Error {
  constructor(
    message: string,
    public code: string,
    public details?: any
  ) {
    super(message)
    this.name = 'ExportError'
  }
}

/**
 * Main export utility class
 */
export class PlaylistExporter {
  private defaultOptions: ExportOptions = {
    format: 'json',
    includeMetadata: true,
    sanitizeData: true,
    dateFormat: 'iso',
    csvOptions: {
      delimiter: ',',
      includeHeaders: true,
      quotedFields: ['name', 'description', 'ownerName', 'genres']
    }
  }

  /**
   * Export search results to specified format
   */
  async exportSearchResults(
    searchResult: SearchResult,
    options: Partial<ExportOptions> = {}
  ): Promise<ExportResult> {
    const startTime = Date.now()
    const exportOptions = { ...this.defaultOptions, ...options }

    try {
      // Validate input
      this.validateSearchResult(searchResult)
      
      // Transform data for export
      const exportData = this.transformSearchResultForExport(searchResult, exportOptions)
      
      // Generate content based on format
      let content: string
      let contentType: string
      
      switch (exportOptions.format) {
        case 'json':
          content = this.generateJsonExport(exportData, exportOptions)
          contentType = 'application/json'
          break
        case 'csv':
          content = this.generateCsvExport(exportData, exportOptions)
          contentType = 'text/csv'
          break
        default:
          throw new ExportError(
            `Unsupported export format: ${exportOptions.format}`,
            'UNSUPPORTED_FORMAT'
          )
      }
      
      // Generate filename
      const filename = this.generateFilename(searchResult, exportOptions)
      
      // Calculate metrics
      const metrics: ExportMetrics = {
        exportTime: Date.now() - startTime,
        recordsProcessed: exportData.playlists.length,
        fieldsIncluded: this.countFields(exportData.playlists[0] || {}),
        dataSize: Buffer.byteLength(content, 'utf8')
      }
      
      return {
        content,
        contentType,
        filename,
        size: metrics.dataSize,
        checksum: this.generateChecksum(content)
      }
      
    } catch (error: any) {
      if (error instanceof ExportError) {
        throw error
      }
      
      throw new ExportError(
        `Export failed: ${error.message}`,
        'EXPORT_FAILED',
        { originalError: error.message }
      )
    }
  }

  /**
   * Transform SearchResult to ExportData format
   */
  private transformSearchResultForExport(
    searchResult: SearchResult,
    options: ExportOptions
  ): ExportData {
    const transformedPlaylists: ExportPlaylist[] = searchResult.playlists.map(playlist => {
      let exportPlaylist: ExportPlaylist = {
        name: this.sanitizeString(playlist.name, options),
        url: playlist.url,
        followers: playlist.followerCount,
        tracks: playlist.trackCount,
        ownerName: this.sanitizeString(playlist.owner.displayName, options),
        ownerProfile: playlist.owner.profileUrl,
        ownerContact: this.formatOwnerContact(playlist.owner.contactInfo, options),
        genres: playlist.genres.join(', '),
        popularity: playlist.popularity,
        lastUpdated: this.formatDate(playlist.lastUpdated, options),
        description: this.sanitizeString(playlist.description || '', options),
        isPublic: playlist.isPublic,
        imageUrl: playlist.imageUrl || '',
        externalUrl: playlist.externalUrl
      }

      // Add optional fields based on availability
      if (playlist.owner.followerCount > 0) {
        exportPlaylist.ownerFollowers = playlist.owner.followerCount
      }

      return exportPlaylist
    })

    return {
      metadata: {
        exportDate: new Date().toISOString(),
        searchCriteria: {
          genres: searchResult.searchMetadata.genresSearched,
          minFollowers: 0, // Would extract from original request
          executionTime: searchResult.searchMetadata.executionTime
        },
        totalPlaylists: transformedPlaylists.length,
        formatVersion: '1.0',
        generatedBy: 'Spotify Playlist Discovery System'
      },
      playlists: transformedPlaylists
    }
  }

  /**
   * Generate JSON export
   */
  private generateJsonExport(exportData: ExportData, options: ExportOptions): string {
    try {
      if (options.includeMetadata) {
        return JSON.stringify(exportData, null, 2)
      } else {
        return JSON.stringify(exportData.playlists, null, 2)
      }
    } catch (error: any) {
      throw new ExportError(
        `JSON serialization failed: ${error.message}`,
        'JSON_SERIALIZATION_FAILED'
      )
    }
  }

  /**
   * Generate CSV export
   */
  private generateCsvExport(exportData: ExportData, options: ExportOptions): string {
    try {
      const csvOptions = options.csvOptions!
      const playlists = exportData.playlists
      
      if (playlists.length === 0) {
        return options.includeMetadata ? this.generateCsvMetadata(exportData) : ''
      }
      
      // Generate CSV headers
      const headers = Object.keys(playlists[0])
      let csvContent = ''
      
      // Add metadata as comments if requested
      if (options.includeMetadata) {
        csvContent += this.generateCsvMetadata(exportData)
        csvContent += '\n'
      }
      
      // Add headers if requested
      if (csvOptions.includeHeaders) {
        csvContent += this.formatCsvRow(headers, csvOptions)
        csvContent += '\n'
      }
      
      // Add data rows
      for (const playlist of playlists) {
        const values = headers.map(header => {
          const value = (playlist as any)[header]
          return this.formatCsvValue(value, header, csvOptions)
        })
        csvContent += this.formatCsvRow(values, csvOptions)
        csvContent += '\n'
      }
      
      return csvContent.trim()
      
    } catch (error: any) {
      throw new ExportError(
        `CSV generation failed: ${error.message}`,
        'CSV_GENERATION_FAILED'
      )
    }
  }

  /**
   * Generate CSV metadata header
   */
  private generateCsvMetadata(exportData: ExportData): string {
    const metadata = exportData.metadata
    return [
      `# Spotify Playlist Discovery Export`,
      `# Generated: ${metadata.exportDate}`,
      `# Total Playlists: ${metadata.totalPlaylists}`,
      `# Genres Searched: ${metadata.searchCriteria.genres.join(', ')}`,
      `# Execution Time: ${metadata.searchCriteria.executionTime}ms`,
      `# Format Version: ${metadata.formatVersion}`
    ].join('\n')
  }

  /**
   * Format CSV row with proper escaping
   */
  private formatCsvRow(values: string[], options: ExportOptions['csvOptions']): string {
    return values
      .map(value => this.escapeCsvValue(value, options!))
      .join(options!.delimiter)
  }

  /**
   * Format individual CSV value
   */
  private formatCsvValue(
    value: any, 
    fieldName: string, 
    options: ExportOptions['csvOptions']
  ): string {
    if (value === null || value === undefined) {
      return ''
    }
    
    // Handle different data types
    if (typeof value === 'boolean') {
      return value ? 'true' : 'false'
    }
    
    if (typeof value === 'number') {
      return value.toString()
    }
    
    // Convert to string and sanitize
    let stringValue = String(value)
    
    // Remove line breaks for CSV compatibility
    stringValue = stringValue.replace(/[\r\n]/g, ' ')
    
    return stringValue
  }

  /**
   * Escape CSV value with quotes if needed
   */
  private escapeCsvValue(value: string, options: ExportOptions['csvOptions']): string {
    const needsQuoting = 
      value.includes(options!.delimiter) ||
      value.includes('"') ||
      value.includes('\n') ||
      value.includes('\r')
    
    if (needsQuoting) {
      // Escape internal quotes by doubling them
      const escaped = value.replace(/"/g, '""')
      return `"${escaped}"`
    }
    
    return value
  }

  /**
   * Format owner contact information
   */
  private formatOwnerContact(contactInfo: any, options: ExportOptions): string {
    if (!contactInfo) return 'Not available'
    
    const parts: string[] = []
    
    if (contactInfo.username) {
      parts.push(`@${contactInfo.username}`)
    }
    
    if (contactInfo.profileUrl) {
      parts.push(contactInfo.profileUrl)
    }
    
    if (contactInfo.socialLinks && contactInfo.socialLinks.length > 0) {
      const socialLinks = contactInfo.socialLinks.map((link: any) => 
        `${link.platform}: ${link.url}`
      ).join('; ')
      parts.push(socialLinks)
    }
    
    return parts.length > 0 ? parts.join(' | ') : 'Not available'
  }

  /**
   * Format date based on options
   */
  private formatDate(dateString: string, options: ExportOptions): string {
    try {
      const date = new Date(dateString)
      
      if (options.dateFormat === 'human') {
        return date.toLocaleString('en-US', {
          year: 'numeric',
          month: 'short',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit'
        })
      }
      
      return date.toISOString()
    } catch {
      return dateString // Return original if parsing fails
    }
  }

  /**
   * Sanitize string data
   */
  private sanitizeString(value: string | null, options: ExportOptions): string {
    if (!value) return ''
    
    if (!options.sanitizeData) return value
    
    return value
      .trim()
      .replace(/[\u0000-\u001F\u007F]/g, '') // Remove control characters
      .replace(/\s+/g, ' ') // Normalize whitespace
      .substring(0, 1000) // Limit length
  }

  /**
   * Generate appropriate filename
   */
  private generateFilename(searchResult: SearchResult, options: ExportOptions): string {
    if (options.filename) {
      return this.ensureFileExtension(options.filename, options.format)
    }
    
    const timestamp = new Date().toISOString().split('T')[0]
    const genres = searchResult.searchMetadata.genresSearched.slice(0, 3).join('-')
    const sanitizedGenres = genres.replace(/[^a-zA-Z0-9-]/g, '')
    
    const baseName = `spotify-playlists-${sanitizedGenres}-${timestamp}`
    return this.ensureFileExtension(baseName, options.format)
  }

  /**
   * Ensure filename has correct extension
   */
  private ensureFileExtension(filename: string, format: string): string {
    const extension = `.${format}`
    if (filename.endsWith(extension)) {
      return filename
    }
    
    // Remove any existing extension
    const nameWithoutExt = filename.replace(/\.[^.]*$/, '')
    return `${nameWithoutExt}${extension}`
  }

  /**
   * Generate checksum for data integrity
   */
  private generateChecksum(content: string): string {
    const crypto = require('crypto')
    return crypto.createHash('sha256').update(content).digest('hex').substring(0, 16)
  }

  /**
   * Count fields in an object (for metrics)
   */
  private countFields(obj: any): number {
    if (!obj || typeof obj !== 'object') return 0
    return Object.keys(obj).length
  }

  /**
   * Validate search result before export
   */
  private validateSearchResult(searchResult: SearchResult): void {
    if (!searchResult) {
      throw new ExportError('Search result is required', 'MISSING_DATA')
    }
    
    if (!searchResult.playlists || !Array.isArray(searchResult.playlists)) {
      throw new ExportError('Search result must contain playlists array', 'INVALID_DATA')
    }
    
    if (!searchResult.searchMetadata) {
      throw new ExportError('Search result must contain metadata', 'MISSING_METADATA')
    }
  }
}

/**
 * Utility functions for client-side export
 */
export class ClientExportUtils {
  /**
   * Trigger browser download of export data
   */
  static downloadExport(exportResult: ExportResult): void {
    try {
      const blob = new Blob([exportResult.content], { 
        type: exportResult.contentType 
      })
      
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      
      link.href = url
      link.download = exportResult.filename
      link.style.display = 'none'
      
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      
      // Clean up the URL object
      setTimeout(() => URL.revokeObjectURL(url), 100)
      
    } catch (error: any) {
      throw new ExportError(
        `Download failed: ${error.message}`,
        'DOWNLOAD_FAILED'
      )
    }
  }

  /**
   * Copy export data to clipboard
   */
  static async copyToClipboard(content: string): Promise<void> {
    try {
      if (navigator.clipboard) {
        await navigator.clipboard.writeText(content)
      } else {
        // Fallback for older browsers
        const textArea = document.createElement('textarea')
        textArea.value = content
        textArea.style.position = 'fixed'
        textArea.style.opacity = '0'
        
        document.body.appendChild(textArea)
        textArea.select()
        document.execCommand('copy')
        document.body.removeChild(textArea)
      }
    } catch (error: any) {
      throw new ExportError(
        `Clipboard copy failed: ${error.message}`,
        'CLIPBOARD_FAILED'
      )
    }
  }

  /**
   * Get export size estimate
   */
  static estimateExportSize(
    searchResult: SearchResult,
    format: 'json' | 'csv'
  ): { size: number; readableSize: string } {
    const playlistCount = searchResult.playlists.length
    
    // Rough estimates based on average data sizes
    let bytesPerPlaylist: number
    
    switch (format) {
      case 'json':
        bytesPerPlaylist = 800 // Average JSON size per playlist
        break
      case 'csv':
        bytesPerPlaylist = 400 // Average CSV row size
        break
      default:
        bytesPerPlaylist = 600
    }
    
    const totalSize = playlistCount * bytesPerPlaylist + 500 // Add metadata overhead
    
    return {
      size: totalSize,
      readableSize: this.formatBytes(totalSize)
    }
  }

  /**
   * Format byte size for human reading
   */
  private static formatBytes(bytes: number): string {
    if (bytes === 0) return '0 Bytes'
    
    const k = 1024
    const sizes = ['Bytes', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
  }

  /**
   * Preview export data (first few records)
   */
  static generatePreview(
    searchResult: SearchResult,
    format: 'json' | 'csv',
    maxRecords: number = 5
  ): string {
    const exporter = new PlaylistExporter()
    
    // Create a limited search result for preview
    const previewResult: SearchResult = {
      ...searchResult,
      playlists: searchResult.playlists.slice(0, maxRecords),
      totalFound: Math.min(searchResult.totalFound, maxRecords)
    }
    
    try {
      const exportPromise = exporter.exportSearchResults(previewResult, {
        format,
        includeMetadata: false,
        sanitizeData: true
      })
      
      // This would need to be handled properly in async context
      // For now, return a placeholder
      return `Preview of ${format.toUpperCase()} export with ${maxRecords} records...`
      
    } catch (error) {
      return `Preview generation failed: ${error}`
    }
  }
}

/**
 * Export format validation utilities
 */
export class ExportValidator {
  /**
   * Validate export options
   */
  static validateOptions(options: Partial<ExportOptions>): string[] {
    const errors: string[] = []
    
    if (options.format && !['json', 'csv'].includes(options.format)) {
      errors.push('Format must be either "json" or "csv"')
    }
    
    if (options.csvOptions?.delimiter && options.csvOptions.delimiter.length !== 1) {
      errors.push('CSV delimiter must be a single character')
    }
    
    if (options.filename && !/^[a-zA-Z0-9-_. ]+$/.test(options.filename)) {
      errors.push('Filename contains invalid characters')
    }
    
    return errors
  }

  /**
   * Validate export result
   */
  static validateExportResult(result: ExportResult): boolean {
    return !!(
      result.content &&
      result.contentType &&
      result.filename &&
      result.size > 0 &&
      result.checksum
    )
  }
}

/**
 * Factory function to create exporter with default configuration
 */
export function createPlaylistExporter(): PlaylistExporter {
  return new PlaylistExporter()
}

/**
 * Convenient export functions
 */
export async function exportToJson(
  searchResult: SearchResult,
  options: Partial<ExportOptions> = {}
): Promise<ExportResult> {
  const exporter = createPlaylistExporter()
  return exporter.exportSearchResults(searchResult, {
    ...options,
    format: 'json'
  })
}

export async function exportToCsv(
  searchResult: SearchResult,
  options: Partial<ExportOptions> = {}
): Promise<ExportResult> {
  const exporter = createPlaylistExporter()
  return exporter.exportSearchResults(searchResult, {
    ...options,
    format: 'csv'
  })
}