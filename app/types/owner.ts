/**
 * Contact status availability levels
 * Reference: data-model.md lines 58-62
 */
export enum ContactStatus {
  PUBLIC = 'public',     // Full info available
  LIMITED = 'limited',   // Partial info available
  PRIVATE = 'private'    // No contact info available
}

/**
 * External social media link
 * Reference: data-model.md lines 52-56
 */
export interface SocialLink {
  platform: string       // Platform name (Instagram, Twitter, etc.)
  url: string            // Link URL
  handle: string         // Username/handle
}

/**
 * Available contact information for playlist owners
 * Reference: data-model.md lines 44-50
 */
export interface ContactInfo {
  username: string               // Spotify username
  profileUrl: string             // Spotify profile URL
  isContactPublic: boolean       // Whether contact info is available
  socialLinks: SocialLink[]      // External social media links (if in bio)
  contactStatus: ContactStatus   // Availability status
}

/**
 * Represents the curator/owner of a playlist
 * Reference: data-model.md lines 30-37
 */
export interface PlaylistOwner {
  id: string                     // Spotify user ID
  displayName: string            // Public display name
  profileUrl: string             // Spotify profile URL
  imageUrl: string | null        // Profile image URL
  followerCount: number | null   // User's follower count (if available)
  contactInfo: ContactInfo       // Available contact information
}