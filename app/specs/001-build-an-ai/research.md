# Research & Technical Decisions

## Spotify API Integration

### Decision: Spotify Web API with OAuth 2.0
**Rationale**: Official API provides comprehensive playlist data including follower counts, owner information, and genre classifications. OAuth enables proper authorization and higher rate limits.

**Alternatives considered**:
- Unofficial scraping: Rejected due to TOS violations and instability
- Third-party APIs: Limited data availability and additional dependencies
- Spotify SDK for Web Playback: Overkill for data-only requirements

### Key Findings:
- Client Credentials Flow suitable for app-only authentication
- Search endpoint supports genre filtering with `genre:` parameter
- Playlist endpoint provides follower count and owner details
- Rate limiting: Varies by endpoint, typically 180 requests/minute
- Owner contact info limited to username and profile URL (email not exposed)

## Nuxt 4 Architecture

### Decision: Server API Routes with Nitro
**Rationale**: Nitro server handles Spotify OAuth securely, prevents exposing credentials to client, and enables server-side caching.

**Alternatives considered**:
- Client-only SPA: Security risk with API credentials
- Separate backend: Unnecessary complexity for this scope
- Edge functions: Limited caching capabilities

### Implementation approach:
- `/server/api/spotify/` routes for API integration
- Server-side token management and refresh
- Response caching to minimize API calls

## Genre Validation

### Decision: Spotify's Available Genre Seeds
**Rationale**: Use `/recommendations/available-genre-seeds` endpoint for valid genres list, ensuring compatibility with search functionality.

**Alternatives considered**:
- Hard-coded genre list: Risk of outdated data
- Free-form text: Poor user experience with invalid genres
- Music database APIs: Additional complexity and inconsistency

## Caching Strategy

### Decision: Hybrid Caching (Server + Client)
**Rationale**: Balance between performance and freshness. Server caches API responses (5 min TTL), client caches search results (localStorage, 15 min TTL).

**Alternatives considered**:
- No caching: Excessive API calls, rate limit issues
- Database caching: Over-engineered for this scope
- CDN caching: Not suitable for personalized searches

### Implementation:
- Nitro's built-in caching for server routes
- localStorage for client-side result persistence
- Cache key: hash of genres + follower minimum

## Export Implementation

### Decision: Client-side Generation
**Rationale**: No server load, instant generation, works offline for cached data.

**Alternatives considered**:
- Server-side generation: Unnecessary server resources
- Third-party service: Additional dependency
- Browser download API: Selected for simplicity

### Libraries:
- Built-in JSON.stringify for JSON export
- Lightweight CSV generation using template literals
- Blob API for file download

## UI Component Strategy

### Decision: Nuxt UI Pro Components
**Rationale**: Pre-built, accessible components with consistent design system. Includes UTable for results display, UForm for input, UButton for actions.

**Alternatives considered**:
- Custom components: Time-consuming, accessibility concerns
- Other UI libraries: Learning curve, potential conflicts
- Headless UI: More implementation work required

## Error Handling

### Decision: Graceful Degradation with User Feedback
**Rationale**: Clear error messages for common scenarios (rate limits, network issues, invalid input) with actionable recovery options.

**Implementation**:
- Toast notifications for transient errors
- Inline validation for form inputs
- Fallback UI for critical failures
- Retry mechanism with exponential backoff

## Performance Optimizations

### Decisions Made:
1. **Pagination**: Load playlists in batches to improve perceived performance
2. **Virtual scrolling**: For large result sets using UTable's built-in support
3. **Debounced search**: Prevent excessive API calls during typing
4. **Parallel requests**: Fetch playlist details concurrently (respecting rate limits)
5. **Image lazy loading**: For playlist cover images

## Security Considerations

### Decisions Made:
1. **Environment variables**: Store Spotify credentials securely
2. **Server-only routes**: Protect sensitive operations
3. **Input sanitization**: Validate and sanitize all user inputs
4. **CORS configuration**: Restrict API access appropriately
5. **Rate limiting**: Implement per-user rate limiting to prevent abuse

## Testing Strategy

### Decision: Comprehensive Test Coverage
**Rationale**: Ensure reliability and maintainability through thorough testing at all levels.

**Test Data**:
- Mock Spotify API responses for unit tests
- Test Spotify account with curated playlists for integration tests
- Snapshot testing for UI components

## Deployment Configuration

### Decision: Vercel with Environment Variables
**Rationale**: Native Nuxt support, automatic deployments, secure secret management.

**Configuration**:
- Auto-scaling for traffic spikes
- Environment variables for Spotify credentials
- Custom domain configuration
- Analytics integration for monitoring

---

## Summary of Resolved Clarifications

All technical decisions have been made based on:
1. Specification requirements
2. Best practices for Nuxt 4 development  
3. Spotify API capabilities and limitations
4. Performance and security considerations
5. User experience priorities

No remaining NEEDS CLARIFICATION items.