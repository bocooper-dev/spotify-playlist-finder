# Claude Code Context - Spotify Playlist Discovery

## Project Overview
Web application for discovering popular Spotify playlists by genre, built with Nuxt 4 and deployed on Vercel.

## Tech Stack
- **Framework**: Nuxt 4 with Nitro server
- **UI**: Nuxt UI Pro, Tailwind CSS
- **API**: Spotify Web API with OAuth 2.0
- **Testing**: Vitest, Playwright
- **Deployment**: Vercel
- **Language**: TypeScript 5.x

## Key Libraries
- `@nuxt/ui-pro` - UI components
- `@spotify/web-api-sdk` - Spotify integration
- `tailwindcss` - Styling
- `vitest` - Unit/integration testing
- `playwright` - E2E testing

## Project Structure
```
/
├── server/
│   └── api/
│       └── spotify/     # Spotify API routes
├── pages/               # Nuxt pages
├── components/          # Vue components
├── composables/         # Vue composables
├── lib/
│   ├── spotify-client/  # Spotify API library
│   ├── export-utils/    # Export functionality
│   └── cache-manager/   # Caching logic
└── tests/
    ├── contract/        # API contract tests
    ├── integration/     # Integration tests
    └── e2e/            # End-to-end tests
```

## Current Implementation Status
- [x] Specification complete
- [x] Technical research done
- [x] Data models defined
- [x] API contracts created
- [ ] Tests written (TDD approach)
- [ ] Implementation started

## Key Features
1. Search playlists by 1-10 genres
2. Filter by minimum follower count
3. Return exactly 50 playlists
4. Display owner contact info
5. Export to CSV/JSON
6. Local caching (15 min TTL)

## API Endpoints
- `GET /api/spotify/genres` - Available genres
- `POST /api/spotify/search` - Search playlists
- `GET /api/spotify/playlist/:id` - Playlist details
- `POST /api/export` - Export results

## Environment Variables
```env
SPOTIFY_CLIENT_ID
SPOTIFY_CLIENT_SECRET
SPOTIFY_REDIRECT_URI
NUXT_PUBLIC_APP_URL
```

## Development Commands
```bash
pnpm dev          # Start dev server
pnpm test         # Run all tests
pnpm build        # Build for production
pnpm preview      # Preview production build
```

## Testing Approach
Following TDD with RED-GREEN-Refactor:
1. Contract tests first
2. Integration tests
3. E2E tests
4. Unit tests last

## Recent Changes
- Initial project setup
- Specification and planning complete
- Data models and API contracts defined

## Known Constraints
- Spotify API rate limits
- Max 10 genres per search
- 50 playlist result limit
- 2-minute search timeout

## Next Steps
1. Write failing contract tests
2. Implement API endpoints
3. Build UI components
4. Add caching layer
5. Implement export functionality