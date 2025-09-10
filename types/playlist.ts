import type { PlaylistOwner } from './owner'

/**
 * Represents a Spotify playlist with discovery metadata.
 * Reference: data-model.md lines 9-23
 */
export interface Playlist {
  id: string                    // Spotify playlist ID
  name: string                  // Playlist name
  description: string | null    // Playlist description
  url: string                   // Spotify Web URL
  externalUrl: string          // Spotify app URL
  imageUrl: string | null      // Cover image URL
  followerCount: number        // Total followers
  trackCount: number           // Number of tracks
  owner: PlaylistOwner         // Owner information
  genres: string[]             // Associated genres (derived)
  popularity: number           // Calculated popularity score
  lastUpdated: string          // ISO timestamp of last update
  isPublic: boolean            // Public visibility status
}