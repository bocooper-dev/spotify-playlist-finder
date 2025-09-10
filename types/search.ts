import type { Playlist } from './playlist'

/**
 * Metadata about search execution
 * Reference: data-model.md lines 95-102
 */
export interface SearchMetadata {
  executionTime: number          // Time in milliseconds
  genresSearched: string[]       // Actual genres searched
  genresNotFound: string[]       // Invalid/unrecognized genres
  apiCallsCount: number          // Number of Spotify API calls
  cacheHit: boolean              // Whether results from cache
  warnings: string[]             // Any warnings (rate limits, etc.)
}

/**
 * User input for playlist discovery
 * Reference: data-model.md lines 69-75
 */
export interface SearchRequest {
  id: string                     // Unique request ID
  genres: string[]               // Selected genres (1-10)
  minFollowers: number           // Minimum follower requirement
  timestamp: string              // ISO timestamp
  userId?: string                // Optional user identifier
}

/**
 * Collection of discovered playlists
 * Reference: data-model.md lines 82-88
 */
export interface SearchResult {
  requestId: string              // Links to SearchRequest
  playlists: Playlist[]          // Array of 50 playlists
  totalFound: number             // Total playlists matching criteria
  searchMetadata: SearchMetadata // Search execution details
  cachedAt?: string              // Cache timestamp if applicable
}