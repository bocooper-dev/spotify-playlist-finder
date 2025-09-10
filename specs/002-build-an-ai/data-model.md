# Data Model Specification

## Core Entities

### Playlist
Represents a Spotify playlist with discovery metadata.

```typescript
interface Playlist {
  id: string;                    // Spotify playlist ID
  name: string;                   // Playlist name
  description: string | null;     // Playlist description
  url: string;                    // Spotify Web URL
  externalUrl: string;            // Spotify app URL
  imageUrl: string | null;        // Cover image URL
  followerCount: number;          // Total followers
  trackCount: number;             // Number of tracks
  owner: PlaylistOwner;           // Owner information
  genres: string[];               // Associated genres (derived)
  popularity: number;             // Calculated popularity score
  lastUpdated: string;            // ISO timestamp of last update
  isPublic: boolean;              // Public visibility status
}
```

### PlaylistOwner
Represents the curator/owner of a playlist.

```typescript
interface PlaylistOwner {
  id: string;                     // Spotify user ID
  displayName: string;            // Public display name
  profileUrl: string;             // Spotify profile URL
  imageUrl: string | null;        // Profile image URL
  followerCount: number | null;   // User's follower count (if available)
  contactInfo: ContactInfo;       // Available contact information
}
```

### ContactInfo
Available contact information for playlist owners.

```typescript
interface ContactInfo {
  username: string;               // Spotify username
  profileUrl: string;             // Spotify profile URL
  isContactPublic: boolean;       // Whether contact info is available
  socialLinks: SocialLink[];      // External social media links (if in bio)
  contactStatus: ContactStatus;   // Availability status
}

interface SocialLink {
  platform: string;               // Platform name (Instagram, Twitter, etc.)
  url: string;                    // Link URL
  handle: string;                 // Username/handle
}

enum ContactStatus {
  PUBLIC = 'public',              // Full info available
  LIMITED = 'limited',            // Partial info available
  PRIVATE = 'private'             // No contact info available
}
```

### SearchRequest
User input for playlist discovery.

```typescript
interface SearchRequest {
  id: string;                     // Unique request ID
  genres: string[];               // Selected genres (1-10)
  minFollowers: number;           // Minimum follower requirement
  timestamp: string;              // ISO timestamp
  userId?: string;                // Optional user identifier
}
```

### SearchResult
Collection of discovered playlists.

```typescript
interface SearchResult {
  requestId: string;              // Links to SearchRequest
  playlists: Playlist[];          // Array of 50 playlists
  totalFound: number;             // Total playlists matching criteria
  searchMetadata: SearchMetadata; // Search execution details
  cachedAt?: string;              // Cache timestamp if applicable
}
```

### SearchMetadata
Metadata about search execution.

```typescript
interface SearchMetadata {
  executionTime: number;          // Time in milliseconds
  genresSearched: string[];       // Actual genres searched
  genresNotFound: string[];       // Invalid/unrecognized genres
  apiCallsCount: number;          // Number of Spotify API calls
  cacheHit: boolean;              // Whether results from cache
  warnings: string[];             // Any warnings (rate limits, etc.)
}
```

### Genre
Music genre classification.

```typescript
interface Genre {
  id: string;                     // Genre identifier
  name: string;                   // Display name
  category: string;               // Genre category (rock, electronic, etc.)
  relatedGenres: string[];        // Related genre IDs for padding
  isAvailable: boolean;           // Currently available in Spotify
}
```

### ExportData
Data structure for CSV/JSON export.

```typescript
interface ExportData {
  metadata: {
    exportDate: string;           // ISO timestamp
    searchCriteria: {
      genres: string[];
      minFollowers: number;
    };
    totalPlaylists: number;
  };
  playlists: ExportPlaylist[];
}

interface ExportPlaylist {
  name: string;
  url: string;
  followers: number;
  tracks: number;
  ownerName: string;
  ownerProfile: string;
  ownerContact: string;          // "Available" | "Limited" | "Not Available"
  genres: string;                 // Comma-separated
  lastUpdated: string;
}
```

## State Management

### ApplicationState
Global application state.

```typescript
interface ApplicationState {
  user: UserSession | null;
  search: SearchState;
  cache: CacheState;
  ui: UIState;
}

interface UserSession {
  id: string;
  preferences: UserPreferences;
  history: SearchRequest[];
}

interface SearchState {
  currentRequest: SearchRequest | null;
  currentResult: SearchResult | null;
  isLoading: boolean;
  error: Error | null;
}

interface CacheState {
  results: Map<string, CachedResult>;
  genres: Genre[];
  lastUpdated: string;
}

interface CachedResult {
  key: string;                   // Hash of search params
  result: SearchResult;
  expiresAt: string;
}

interface UIState {
  selectedPlaylists: string[];   // For bulk operations
  sortBy: SortField;
  sortOrder: 'asc' | 'desc';
  filterText: string;
  viewMode: 'table' | 'grid';
}
```

## Validation Rules

### SearchRequest Validation
- `genres`: 1-10 items, must be valid Spotify genres
- `minFollowers`: Non-negative integer, max 1,000,000
- At least one genre must be provided

### Playlist Validation
- `followerCount`: Non-negative integer
- `url`: Valid Spotify URL format
- `genres`: At least one genre association

### Export Validation
- Maximum 50 playlists per export
- File size limit: 10MB for JSON, 5MB for CSV

## State Transitions

### Search Flow States
```
IDLE → VALIDATING → SEARCHING → PROCESSING → COMPLETE
                 ↓            ↓             ↓
              ERROR ←--------←--------------←
```

### Cache States
```
MISS → FETCHING → STORING → HIT
    ↓           ↓         ↓
  STALE → REFRESHING → UPDATED
```

## Data Relationships

1. **SearchRequest** → **SearchResult**: One-to-one
2. **SearchResult** → **Playlist**: One-to-many (exactly 50)
3. **Playlist** → **PlaylistOwner**: Many-to-one
4. **Playlist** → **Genre**: Many-to-many
5. **Genre** → **Genre**: Many-to-many (related genres)

## Storage Specifications

### LocalStorage Schema
```typescript
{
  "spotify-search-cache": {
    [cacheKey: string]: {
      result: SearchResult;
      expiresAt: number;
    }
  },
  "spotify-search-history": SearchRequest[],
  "spotify-user-preferences": UserPreferences
}
```

### Session Storage Schema
```typescript
{
  "spotify-current-search": SearchState,
  "spotify-auth-token": string
}
```

## Performance Considerations

1. **Playlist** objects should be lightweight for table rendering
2. **Image URLs** should use thumbnail sizes when available
3. **Pagination** should load 10 playlists at a time for initial render
4. **Virtual scrolling** for result sets > 20 items
5. **Debounce** search input by 500ms

## Security Considerations

1. Never store Spotify API credentials in frontend code
2. Sanitize all user inputs before API calls
3. Validate genre names against whitelist
4. Rate limit by IP/session to prevent abuse
5. No PII storage without user consent