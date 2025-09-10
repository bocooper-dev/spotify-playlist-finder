/**
 * Music genre classification
 * Reference: data-model.md lines 109-115
 */
export interface Genre {
  id: string                     // Genre identifier
  name: string                   // Display name
  category: string               // Genre category (rock, electronic, etc.)
  relatedGenres: string[]        // Related genre IDs for padding
  isAvailable: boolean           // Currently available in Spotify
}