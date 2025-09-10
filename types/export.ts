/**
 * Simplified playlist data for export
 * Reference: data-model.md lines 134-144
 */
export interface ExportPlaylist {
  name: string
  url: string
  followers: number
  tracks: number
  ownerName: string
  ownerProfile: string
  ownerContact: string // "Available" | "Limited" | "Not Available"
  genres: string // Comma-separated
  lastUpdated: string
}

/**
 * Data structure for CSV/JSON export
 * Reference: data-model.md lines 122-132
 */
export interface ExportData {
  metadata: {
    exportDate: string // ISO timestamp
    searchCriteria: {
      genres: string[]
      minFollowers: number
    }
    totalPlaylists: number
  }
  playlists: ExportPlaylist[]
}
