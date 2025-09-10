# Spotify Playlist Discovery - Quick Start Guide

## Prerequisites

- Node.js 20+ and npm/pnpm
- Self-signed HTTPS certificate for localhost (e.g., mkcert)
- Spotify Developer Account
- Vercel account (for deployment)

## Setup Instructions

### 1. Clone and Install

```bash
git clone <repository-url>
cd spotify-playlist-finder
pnpm install
```

### 2. Setup HTTPS for Localhost
Using mkcert:

```bash
mkcert -install
mkcert localhost
```

### 3. Configure Spotify API

1. Go to [Spotify Developer Dashboard](https://developer.spotify.com/dashboard)
2. Create a new app
3. Note your Client ID and Client Secret
4. Add `https://localhost:3000/callback` to Redirect URIs

### 4. Environment Setup

Create `.env` file:

```env
SPOTIFY_CLIENT_ID=your_client_id
SPOTIFY_CLIENT_SECRET=your_client_secret
SPOTIFY_REDIRECT_URI=https://localhost:3000/callback
NUXT_PUBLIC_APP_URL=https://localhost:3000
```

### 5. Start Development Server

```bash
pnpm dev
```

Visit `https://localhost:3000`

## Feature Walkthrough

### Basic Playlist Search

1. **Open the application**
   - Navigate to https://localhost:3000
   - You should see the search interface

2. **Enter search criteria**
   - Select 1-3 genres from the dropdown (e.g., "pop", "rock", "jazz")
   - Set minimum follower count to 1000
   - Click "Search Playlists"

3. **Review results**
   - Verify 50 playlists are returned
   - Check each playlist shows:
     - Playlist name and image
     - Follower count
     - Owner name with profile link
     - Playlist URL

### Advanced Search

1. **Multi-genre search**
   - Select up to 10 genres
   - Set minimum followers to 5000
   - Search and verify results span multiple genres

2. **Edge case: Few results**
   - Search for obscure genre (e.g., "wonky")
   - Set high follower minimum (50000)
   - Verify system pads results with related genres

### Export Functionality

1. **Export to CSV**
   - Perform a search
   - Click "Export as CSV"
   - Verify file downloads with all playlist data
   - Open in spreadsheet application

2. **Export to JSON**
   - Click "Export as JSON"
   - Verify JSON structure matches specification
   - Validate all fields are present

### Caching Behavior

1. **Test cache hit**
   - Perform a search
   - Note the response time
   - Repeat exact same search
   - Verify faster response (cache indicator shown)

2. **Test cache expiry**
   - Wait 15+ minutes
   - Repeat previous search
   - Verify fresh data is fetched

## Validation Checklist

### Functional Requirements

- [ ] Accepts 1-10 genre inputs
- [ ] Validates genres against Spotify's list
- [ ] Returns exactly 50 playlists
- [ ] Shows playlist URLs
- [ ] Shows owner contact information
- [ ] Displays follower counts
- [ ] Sorts by popularity (followers)
- [ ] Completes search within 2 minutes
- [ ] Handles invalid genres gracefully
- [ ] Caches results locally
- [ ] Exports to CSV format
- [ ] Exports to JSON format

### UI/UX Requirements

- [ ] Responsive design (mobile/tablet/desktop)
- [ ] Loading states during search
- [ ] Error messages are clear
- [ ] Form validation works
- [ ] Results table is sortable
- [ ] Pagination/virtual scroll works
- [ ] Export buttons are accessible

### Edge Cases

- [ ] Empty genre input shows error
- [ ] >10 genres shows validation error
- [ ] Invalid genre names highlighted
- [ ] Network errors handled gracefully
- [ ] Rate limit errors show retry option
- [ ] Private playlist owners marked appropriately

## Testing Commands

### Run Unit Tests
```bash
pnpm test:unit
```

### Run Integration Tests
```bash
pnpm test:integration
```

### Run E2E Tests
```bash
pnpm test:e2e
```

### Run All Tests
```bash
pnpm test
```

## Deployment

### Deploy to Vercel

1. **Connect Repository**
   ```bash
   vercel
   ```

2. **Configure Environment**
   - Add Spotify credentials in Vercel dashboard
   - Set production URL

3. **Deploy**
   ```bash
   vercel --prod
   ```

## Troubleshooting

### Common Issues

1. **"Invalid genre" error**
   - Check genre spelling
   - Use genre dropdown for valid options

2. **"Rate limit exceeded"**
   - Wait for retry timer
   - Reduce search frequency

3. **"No playlists found"**
   - Lower minimum follower count
   - Try more popular genres

4. **Export not working**
   - Check browser download settings
   - Verify popup blocker disabled

### Debug Mode

Enable debug logging:
```bash
DEBUG=* pnpm dev
```

## Performance Benchmarks

Expected performance metrics:

- Initial page load: <3 seconds
- Search completion: <30 seconds (typical)
- Cache retrieval: <500ms
- Export generation: <1 second
- Table rendering (50 items): <200ms

## Support Resources

- [Spotify Web API Documentation](https://developer.spotify.com/documentation/web-api/)
- [Nuxt 4 Documentation](https://nuxt.com/docs)
- [Nuxt UI Pro Components](https://ui.nuxt.com)

## Quick Test Scenarios

### Scenario 1: Basic Success Path
```
Input: genres=["pop"], minFollowers=1000
Expected: 50 popular pop playlists
Time: <30 seconds
```

### Scenario 2: Multi-Genre Search
```
Input: genres=["rock", "indie", "alternative"], minFollowers=5000
Expected: 50 playlists across genres
Time: <45 seconds
```

### Scenario 3: Export Test
```
Action: Search → Export CSV → Export JSON
Expected: Both files download successfully
Validation: All data fields present
```

### Scenario 4: Error Handling
```
Input: genres=["notarealgenre"], minFollowers=0
Expected: Clear error message about invalid genre
Recovery: Suggestion of similar valid genres
```