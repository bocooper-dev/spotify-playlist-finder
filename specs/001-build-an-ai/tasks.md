# Tasks: Spotify Playlist Discovery System

**Input**: Design documents from `/specs/001-build-an-ai/`
**Prerequisites**: plan.md (required), research.md, data-model.md, contracts/

## 📚 Key Reference Documents
- **Data Models**: `data-model.md` - TypeScript interfaces and validation rules
- **API Contracts**: `contracts/api-contract.yaml` - OpenAPI endpoint specifications  
- **Technical Decisions**: `research.md` - Architecture choices and implementation details
- **Test Scenarios**: `quickstart.md` - User journeys and validation checklist
- **Requirements**: `spec.md` - Functional requirements (FR-001 through FR-013)
- **Architecture**: `plan.md` - Tech stack, libraries, and project structure

## ⚠️ Critical Implementation Notes
1. **TDD Enforcement**: Contract tests (T015-T018) MUST fail before implementation
2. **Data Model Accuracy**: Copy interfaces exactly from `data-model.md` with line references
3. **API Compliance**: All endpoints must match `api-contract.yaml` schemas
4. **Performance Goals**: <2 min search, <3s page load (`plan.md` line 41)
5. **Rate Limits**: 180 req/min for Spotify API (`research.md` Key Findings)
6. **Caching**: 5 min server TTL, 15 min client TTL (`research.md` Caching Strategy)

## Execution Flow (main)
```
1. Load plan.md from feature directory
   → If not found: ERROR "No implementation plan found"
   → Extract: tech stack, libraries, structure
2. Load optional design documents:
   → data-model.md: Extract entities → model tasks
   → contracts/: Each file → contract test task
   → research.md: Extract decisions → setup tasks
3. Generate tasks by category:
   → Setup: project init, dependencies, linting
   → Tests: contract tests, integration tests
   → Core: models, services, CLI commands
   → Integration: DB, middleware, logging
   → Polish: unit tests, performance, docs
4. Apply task rules:
   → Different files = mark [P] for parallel
   → Same file = sequential (no [P])
   → Tests before implementation (TDD)
5. Number tasks sequentially (T001, T002...)
6. Generate dependency graph
7. Create parallel execution examples
8. Validate task completeness:
   → All contracts have tests?
   → All entities have models?
   → All endpoints implemented?
9. Return: SUCCESS (tasks ready for execution)
```

## Format: `[ID] [P?] Description`
- **[P]**: Can run in parallel (different files, no dependencies)
- Include exact file paths in descriptions

## Path Conventions
- **Nuxt integrated structure**: Repository root contains Nuxt app
- Server routes: `server/api/`
- Components: `components/`
- Pages: `pages/`
- Libraries: `lib/`
- Tests: `tests/`

## Phase 3.1: Setup & Infrastructure
- [ ] T001 Clone Nuxt UI starter template from https://github.com/nuxt-ui-templates/starter
- [ ] T002 Configure project with TypeScript 5.x, Node.js 20+, and required dependencies
- [ ] T003 Setup HTTPS for localhost using mkcert for secure Spotify OAuth
- [ ] T004 [P] Configure Vercel deployment and GitHub Actions workflow in .github/workflows/deploy.yml
- [ ] T005 [P] Setup N8N instance and create base workflow structure for AI agent orchestration
- [ ] T006 [P] Configure Apify account and create actor for Spotify playlist scraping
- [ ] T007 [P] Create .env.example with all required environment variables
- [ ] T008 Setup Vitest testing framework and Playwright for E2E tests

## Phase 3.2: Data Models & Types (TDD - Create Types First)
**Reference**: See `data-model.md` for complete specifications
- [ ] T009 [P] Create Playlist interface in types/playlist.ts 
  - Copy from `data-model.md` lines 9-23
  - Include: id, name, url, followerCount, owner, genres fields
- [ ] T010 [P] Create PlaylistOwner and ContactInfo interfaces in types/owner.ts
  - Copy from `data-model.md` lines 30-62
  - Include ContactStatus enum and SocialLink interface
- [ ] T011 [P] Create SearchRequest and SearchResult interfaces in types/search.ts
  - Copy from `data-model.md` lines 69-88
  - Include SearchMetadata interface (lines 95-102)
- [ ] T012 [P] Create Genre interface in types/genre.ts
  - Copy from `data-model.md` lines 106-113
  - Include relatedGenres array for padding feature
- [ ] T013 [P] Create ExportData interfaces in types/export.ts
  - Copy from `data-model.md` lines 117-141
  - Include both ExportData and ExportPlaylist interfaces
- [ ] T014 [P] Create ApplicationState interfaces in types/state.ts
  - Copy from `data-model.md` lines 147-176
  - Include UserSession, SearchState, CacheState, UIState

## Phase 3.3: Contract Tests (MUST FAIL FIRST) ⚠️
**CRITICAL: These tests MUST be written and MUST FAIL before ANY implementation**
**Reference**: See `contracts/api-contract.yaml` for OpenAPI specifications
- [ ] T015 [P] Contract test GET /api/spotify/genres in tests/contract/test_genres.spec.ts
  - Test against `api-contract.yaml` lines 14-34
  - Verify Genre schema compliance
- [ ] T016 [P] Contract test POST /api/spotify/search in tests/contract/test_search.spec.ts
  - Test against `api-contract.yaml` lines 36-59
  - Validate SearchRequest/SearchResult schemas
- [ ] T017 [P] Contract test GET /api/spotify/playlist/:id in tests/contract/test_playlist.spec.ts
  - Test against `api-contract.yaml` lines 61-77
  - Verify Playlist schema with all nested objects
- [ ] T018 [P] Contract test POST /api/export in tests/contract/test_export.spec.ts
  - Test against `api-contract.yaml` lines 79-103
  - Test both CSV and JSON response formats

## Phase 3.4: N8N Workflows & Apify Integration
**Reference**: See `research.md` - Spotify API Integration & Caching Strategy sections
- [ ] T019 Create N8N workflow for Spotify authentication and token management
  - Implement Client Credentials Flow (`research.md` OAuth 2.0 section)
  - Token refresh logic with expiry handling
- [ ] T020 Create N8N workflow for genre validation using Spotify API
  - Use `/recommendations/available-genre-seeds` endpoint (`research.md` Genre Validation)
- [ ] T021 Configure Apify actor for scraping additional playlist metadata
  - Extract social links from playlist descriptions
  - Scrape owner profile for contact info
- [ ] T022 Create N8N workflow connecting to Apify for enhanced playlist data
  - Webhook trigger from Nuxt app
  - Merge Apify data with Spotify API response
- [ ] T023 Setup N8N webhook endpoints for async processing
  - Rate limit handling with queue management
- [ ] T024 Create error handling and retry logic in N8N workflows
  - Exponential backoff (`research.md` Error Handling section)

## Phase 3.5: Libraries Implementation
**Reference**: See `plan.md` Architecture section & `research.md` Technical Decisions
- [ ] T025 [P] Create spotify-client library in lib/spotify-client/index.ts with OAuth flow
  - Implement Client Credentials Flow (`research.md` Spotify API Integration)
  - Rate limiting: 180 requests/minute (`research.md` Key Findings)
  - Use Spotify Web API SDK (`plan.md` line 36)
- [ ] T026 [P] Create export-utils library in lib/export-utils/index.ts for CSV/JSON generation
  - Client-side generation using Blob API (`research.md` Export Implementation)
  - Support formats from `data-model.md` ExportData interface
- [ ] T027 [P] Create cache-manager library in lib/cache-manager/index.ts for localStorage/session
  - Hybrid caching strategy (`research.md` Caching Strategy)
  - 5 min server TTL, 15 min client TTL
  - Cache key: hash of genres + follower minimum
- [ ] T028 [P] Add CLI interface for spotify-client in lib/spotify-client/cli.ts
  - Commands: --search, --get-genres, --get-playlist
- [ ] T029 [P] Add CLI interface for export-utils in lib/export-utils/cli.ts
  - Commands: --to-csv, --to-json, --format
- [ ] T030 [P] Add CLI interface for cache-manager in lib/cache-manager/cli.ts
  - Commands: --get, --set, --clear, --list

## Phase 3.6: API Implementation (Server Routes)
**Reference**: Implement endpoints defined in `contracts/api-contract.yaml`
- [ ] T031 Implement GET /api/spotify/genres in server/api/spotify/genres.get.ts
  - Return Genre[] from `api-contract.yaml` lines 27-32
  - Use spotify-client library from T025
- [ ] T032 Implement POST /api/spotify/search in server/api/spotify/search.post.ts
  - Accept SearchRequest (`api-contract.yaml` lines 45-46)
  - Return SearchResult with exactly 50 playlists
  - Implement padding logic if <50 results (`spec.md` edge cases)
- [ ] T033 Implement GET /api/spotify/playlist/[id] in server/api/spotify/playlist/[id].get.ts
  - Return Playlist with owner details (`api-contract.yaml` lines 66-77)
- [ ] T034 Implement POST /api/export in server/api/export.post.ts
  - Support CSV and JSON formats (`api-contract.yaml` lines 86-103)
  - Use export-utils library from T026
- [ ] T035 Create N8N webhook handler in server/api/webhooks/n8n.post.ts
  - Handle async Apify results
- [ ] T036 Implement rate limiting middleware in server/middleware/rateLimit.ts
  - Per-user limits (`research.md` Security Considerations)
- [ ] T037 Add structured logging middleware in server/middleware/logging.ts
  - Log format per `plan.md` Observability section

## Phase 3.7: UI Components (Nuxt UI Pro)
**Reference**: Use Nuxt UI Pro components per `research.md` UI Component Strategy
- [ ] T038 Create PlaylistSearchForm component in components/PlaylistSearchForm.vue using UForm
  - Validate 1-10 genres (`spec.md` FR-001)
  - Minimum follower input with validation (`spec.md` FR-005)
- [ ] T039 Create PlaylistTable component in components/PlaylistTable.vue using UTable
  - Display 50 playlists (`spec.md` FR-005)
  - Virtual scrolling for performance (`research.md` Performance Optimizations)
- [ ] T040 Create PlaylistCard component in components/PlaylistCard.vue using UCard
  - Show playlist image, name, follower count
  - Display owner info per `data-model.md` PlaylistOwner
- [ ] T041 Create ExportButtons component in components/ExportButtons.vue using UButton
  - CSV and JSON export options (`spec.md` FR-013)
- [ ] T042 Create GenreSelector component in components/GenreSelector.vue using USelectMenu
  - Load genres from /api/spotify/genres
  - Max 10 selections (`spec.md` constraints)
- [ ] T043 [P] Create LoadingState component in components/LoadingState.vue using USkeleton
  - Show during API calls
- [ ] T044 [P] Create ErrorAlert component in components/ErrorAlert.vue using UAlert
  - Display API errors with retry option

## Phase 3.8: Pages & Routing
- [ ] T045 Create main search page in pages/index.vue with search form and results
- [ ] T046 Create playlist details page in pages/playlist/[id].vue
- [ ] T047 Create export preview page in pages/export.vue
- [ ] T048 Setup auth callback page in pages/callback.vue for Spotify OAuth
- [ ] T049 Configure app.vue with UContainer layout and navigation

## Phase 3.9: State Management & Composables
- [ ] T050 Create useSpotifyAuth composable in composables/useSpotifyAuth.ts
- [ ] T051 Create usePlaylistSearch composable in composables/usePlaylistSearch.ts
- [ ] T052 Create useExport composable in composables/useExport.ts
- [ ] T053 Create useCache composable in composables/useCache.ts
- [ ] T054 Setup Pinia store for global state in stores/playlist.ts

## Phase 3.10: Integration Tests
**Reference**: Test scenarios from `quickstart.md` Feature Walkthrough section
- [ ] T055 [P] Integration test: Complete search flow in tests/integration/search-flow.spec.ts
  - Test Basic Playlist Search scenario (`quickstart.md` lines 58-73)
  - Verify 50 playlists returned with all required fields
- [ ] T056 [P] Integration test: Export functionality in tests/integration/export.spec.ts
  - Test CSV and JSON export (`quickstart.md` lines 86-95)
- [ ] T057 [P] Integration test: Caching behavior in tests/integration/cache.spec.ts
  - Test cache hit/miss scenarios (`quickstart.md` lines 97-108)
- [ ] T058 [P] Integration test: N8N workflow triggers in tests/integration/n8n-workflow.spec.ts
  - Test webhook integration with N8N
- [ ] T059 [P] E2E test: Full user journey in tests/e2e/user-journey.spec.ts
  - Run all test scenarios from `quickstart.md` lines 160-180

## Phase 3.11: Vercel Deployment & GitHub Actions
- [ ] T060 Configure vercel.json with build settings and environment variables
- [ ] T061 Create GitHub Actions workflow for CI/CD in .github/workflows/deploy.yml
- [ ] T062 Setup branch protection rules and automated testing on PR
- [ ] T063 Configure Vercel preview deployments for feature branches
- [ ] T064 Add production environment variables in Vercel dashboard

## Phase 3.12: Polish & Documentation
- [ ] T065 [P] Add unit tests for validation logic in tests/unit/validation.spec.ts
- [ ] T066 [P] Add unit tests for export utilities in tests/unit/export.spec.ts
- [ ] T067 [P] Performance optimization: Virtual scrolling for large result sets
- [ ] T068 [P] Add API documentation in docs/api.md
- [ ] T069 [P] Create user guide in docs/user-guide.md
- [ ] T070 Update README.md with setup instructions and architecture overview
- [ ] T071 Run quickstart.md validation checklist
- [ ] T072 Security audit: Input sanitization and rate limiting verification

## Dependencies
- Setup (T001-T008) must complete first
- Data models (T009-T014) before contract tests
- Contract tests (T015-T018) MUST FAIL before implementation
- N8N/Apify setup (T019-T024) can run parallel to libraries
- Libraries (T025-T030) before API implementation
- API implementation (T031-T037) before UI components
- UI components (T038-T044) before pages
- Pages (T045-T049) before state management
- All implementation before integration tests (T055-T059)
- Deployment setup (T060-T064) can run anytime after T001
- Polish tasks (T065-T072) only after all implementation

## Parallel Execution Examples

### Models & Types (can run simultaneously):
```bash
# Launch T009-T014 together:
Task: "Create Playlist interface in types/playlist.ts"
Task: "Create PlaylistOwner and ContactInfo interfaces in types/owner.ts"
Task: "Create SearchRequest and SearchResult interfaces in types/search.ts"
Task: "Create Genre interface in types/genre.ts"
Task: "Create ExportData interfaces in types/export.ts"
Task: "Create ApplicationState interfaces in types/state.ts"
```

### Contract Tests (after models, run together):
```bash
# Launch T015-T018 together:
Task: "Contract test GET /api/spotify/genres in tests/contract/test_genres.spec.ts"
Task: "Contract test POST /api/spotify/search in tests/contract/test_search.spec.ts"
Task: "Contract test GET /api/spotify/playlist/:id in tests/contract/test_playlist.spec.ts"
Task: "Contract test POST /api/export in tests/contract/test_export.spec.ts"
```

### Libraries (can develop independently):
```bash
# Launch T025-T030 together:
Task: "Create spotify-client library in lib/spotify-client/index.ts"
Task: "Create export-utils library in lib/export-utils/index.ts"
Task: "Create cache-manager library in lib/cache-manager/index.ts"
```

## Notes
- Nuxt UI Pro provides pre-built components - use them directly
- N8N workflows handle complex orchestration logic
- Apify actors provide enhanced scraping capabilities
- Vercel deployment is automated via GitHub Actions
- All Spotify API calls go through server routes for security
- Client-side caching uses localStorage, server uses Nitro cache
- Tests MUST fail first (RED phase of TDD)
- Commit after each completed task

## Validation Checklist
*GATE: Checked before marking complete*

- [x] All API endpoints have contract tests
- [x] All data model entities have TypeScript interfaces
- [x] Tests are written before implementation
- [x] Parallel tasks are truly independent
- [x] Each task specifies exact file path
- [x] No parallel tasks modify the same file
- [x] N8N workflows integrated for AI orchestration
- [x] Apify actors configured for enhanced data
- [x] Vercel deployment automated
- [x] All 72 tasks are specific and executable