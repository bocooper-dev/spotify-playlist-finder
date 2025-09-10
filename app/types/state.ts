import type { SearchRequest, SearchResult } from './search'
import type { Genre } from './genre'

/**
 * UI sort field options
 */
export type SortField = 'name' | 'followers' | 'tracks' | 'lastUpdated'

/**
 * User preferences for the application
 */
export interface UserPreferences {
  defaultGenres: string[]
  defaultMinFollowers: number
  preferredExportFormat: 'csv' | 'json'
  theme: 'light' | 'dark' | 'auto'
}

/**
 * User session data
 * Reference: data-model.md lines 160-164
 */
export interface UserSession {
  id: string
  preferences: UserPreferences
  history: SearchRequest[]
}

/**
 * Current search state
 * Reference: data-model.md lines 166-171
 */
export interface SearchState {
  currentRequest: SearchRequest | null
  currentResult: SearchResult | null
  isLoading: boolean
  error: Error | null
}

/**
 * Cached search result with expiration
 * Reference: data-model.md lines 179-183
 */
export interface CachedResult {
  key: string                   // Hash of search params
  result: SearchResult
  expiresAt: string
}

/**
 * Cache state management
 * Reference: data-model.md lines 173-177
 */
export interface CacheState {
  results: Map<string, CachedResult>
  genres: Genre[]
  lastUpdated: string
}

/**
 * UI state for user interface interactions
 * Reference: data-model.md lines 185-191
 */
export interface UIState {
  selectedPlaylists: string[]   // For bulk operations
  sortBy: SortField
  sortOrder: 'asc' | 'desc'
  filterText: string
  viewMode: 'table' | 'grid'
}

/**
 * Global application state
 * Reference: data-model.md lines 153-158
 */
export interface ApplicationState {
  user: UserSession | null
  search: SearchState
  cache: CacheState
  ui: UIState
}