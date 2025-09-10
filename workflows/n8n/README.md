# N8N Workflows for Spotify Playlist Discovery System

This directory contains N8N workflow configurations that provide AI agent orchestration for enhanced playlist discovery and data processing.

## Workflow Overview

### 1. Spotify Authentication Workflow (`spotify-auth-workflow.json`)

**Purpose**: Manages Spotify OAuth tokens with automated refresh and caching.

**Key Features**:
- Automated token refresh every 50 minutes
- Redis caching with 90% TTL safety margin
- Webhook endpoint for token requests (`/spotify-token`)
- Error handling with Slack notifications
- Token validation and expiry tracking

**Endpoints**:
- `GET /webhook/spotify-token` - Retrieve cached or fresh token

**Triggers**:
- Cron: Every 50 minutes for proactive refresh
- Webhook: On-demand token requests

### 2. Genre Validation Workflow (`genre-validation-workflow.json`)

**Purpose**: Validates genre names against Spotify's available genres with intelligent suggestions.

**Key Features**:
- Real-time genre validation using Spotify API
- Levenshtein distance algorithm for suggestions
- Redis caching of genre lists (1 hour TTL)
- Daily cache refresh at 6 AM
- Fuzzy matching for typos and variations

**Endpoints**:
- `POST /webhook/validate-genres` - Validate genre array

**Logic**:
1. Check cached genres first
2. If cache empty, fetch from Spotify API
3. Normalize and validate requested genres
4. Provide suggestions for invalid genres
5. Return validation results

### 3. Apify Integration Workflow (`apify-integration-workflow.json`)

**Purpose**: Orchestrates Apify actor for enhanced playlist scraping beyond Web API limits.

**Key Features**:
- Batch playlist enhancement via Apify actor
- Intelligent data processing and validation
- Error handling with exponential backoff
- Real-time progress notifications
- Circuit breaker pattern for actor failures

**Endpoints**:
- `POST /webhook/enhance-playlists` - Enhance playlists with scraped data

**Process Flow**:
1. Validate playlist IDs (max 50 per request)
2. Execute Apify actor with optimized settings
3. Process scraped data and merge with API data
4. Cache enhanced results (30 min TTL)
5. Return enriched playlist information

### 4. Error Handling Workflow (`error-handling-workflow.json`)

**Purpose**: Centralized error handling, retry logic, and monitoring across all workflows.

**Key Features**:
- Intelligent error classification system
- Automatic retry with exponential backoff
- Circuit breaker implementation
- Real-time metrics collection
- Critical error alerting via Slack

**Error Types**:
- `RATE_LIMITED`: Spotify API rate limits (5 retries, 1min delay)
- `NETWORK_ERROR`: Connectivity issues (3 retries, 5sec delay)
- `AUTH_ERROR`: Token issues (2 retries, immediate with refresh)
- `APIFY_ERROR`: Actor failures (3 retries, 30sec delay)
- `VALIDATION_ERROR`: Input validation (no retry)
- `UNKNOWN_ERROR`: Unclassified errors (no retry, high severity)

## Deployment Configuration

### Environment Variables

```env
# N8N Configuration
N8N_WEBHOOK_URL=https://your-n8n-instance.com/webhook
N8N_WEBHOOK_API_KEY=your-webhook-api-key
N8N_WEBHOOK_SECRET=your-webhook-secret

# Spotify API
SPOTIFY_CLIENT_ID=your-spotify-client-id
SPOTIFY_CLIENT_SECRET=your-spotify-client-secret

# Apify Integration
APIFY_TOKEN=your-apify-token
APIFY_SPOTIFY_ACTOR_ID=your-actor-id

# Redis Cache
REDIS_URL=redis://your-redis-instance:6379

# Application
NUXT_PUBLIC_APP_URL=https://your-app-domain.com
```

### Webhook Endpoints Configuration

All webhooks are configured in `webhook-endpoints.json` with:
- Authentication via `X-API-Key` header
- Rate limiting per endpoint
- Request/response validation
- CORS configuration
- Monitoring and alerting

## Integration with Nuxt Application

### 1. Server API Routes

The Nuxt application integrates with N8N workflows via server API routes:

```typescript
// /server/api/spotify/genres.get.ts
const genres = await $fetch(`${N8N_WEBHOOK_URL}/validate-genres`, {
  method: 'POST',
  headers: { 'X-API-Key': N8N_WEBHOOK_API_KEY },
  body: { genres: requestedGenres }
})

// /server/api/spotify/search.post.ts  
const enhancedPlaylists = await $fetch(`${N8N_WEBHOOK_URL}/enhance-playlists`, {
  method: 'POST', 
  headers: { 'X-API-Key': N8N_WEBHOOK_API_KEY },
  body: { playlistIds: discoveredPlaylists.map(p => p.id) }
})
```

### 2. Webhook Handler

The application receives notifications from N8N via `/api/webhooks/n8n.post.ts`:
- Token refresh notifications
- Enhancement completion events
- Error alerts and maintenance warnings

### 3. Caching Strategy

**Two-tier caching**:
1. **N8N Level** (Redis): API responses, tokens, genre lists
2. **Application Level** (Nitro): Processed results, user sessions

## Monitoring and Alerting

### Metrics Collection

Every 5 minutes, the error handling workflow collects:
- Total error count by type/severity/workflow
- Circuit breaker status
- Retry success rates
- Performance metrics

### Alert Conditions

**Critical Alerts** (Slack notifications):
- High error rate (>20 errors/5min)
- Circuit breakers open
- Authentication failures
- Apify actor maintenance issues

### Health Checks

- `/webhook/health` - Overall workflow health
- `/webhook/metrics` - Prometheus-compatible metrics
- Individual workflow status monitoring

## Best Practices

### Rate Limiting Strategy

1. **Spotify API**: 180 requests/minute (workflow level throttling)
2. **Apify Actor**: 3 concurrent requests max, 2sec delays
3. **N8N Webhooks**: Per-endpoint limits in configuration
4. **Application**: User-level rate limiting

### Error Recovery

1. **Graceful Degradation**: Return cached data when workflows fail
2. **Circuit Breakers**: Auto-disable failing workflows temporarily
3. **Retry Logic**: Intelligent backoff based on error type
4. **Monitoring**: Real-time alerts for critical failures

### Security

1. **Authentication**: All webhooks require API key validation
2. **Input Validation**: Schema validation for all requests
3. **Rate Limiting**: Protection against abuse
4. **Logging**: Comprehensive audit trail (no sensitive data)

## Development and Testing

### Local Development

```bash
# Start N8N locally with workflows
docker-compose up n8n

# Import workflows
n8n import:workflow spotify-auth-workflow.json
n8n import:workflow genre-validation-workflow.json
n8n import:workflow apify-integration-workflow.json
n8n import:workflow error-handling-workflow.json

# Test webhook endpoints
curl -X POST http://localhost:5678/webhook/validate-genres \
  -H "X-API-Key: test-key" \
  -H "Content-Type: application/json" \
  -d '{"genres": ["pop", "rock", "invalid-genre"]}'
```

### Testing Strategy

1. **Unit Tests**: Individual workflow node logic
2. **Integration Tests**: End-to-end workflow execution
3. **Load Tests**: Rate limiting and performance validation
4. **Error Tests**: Failure scenario handling

## Troubleshooting

### Common Issues

1. **Token Refresh Failures**
   - Check Spotify credentials
   - Verify Redis connectivity
   - Review rate limiting logs

2. **Apify Actor Errors**
   - Confirm actor availability
   - Check proxy configuration
   - Validate input parameters

3. **High Error Rates**
   - Review error classification logs
   - Check circuit breaker status
   - Verify external service health

4. **Webhook Authentication**
   - Validate API keys
   - Check header format
   - Review CORS configuration

### Debug Commands

```bash
# Check workflow execution logs
n8n executions:list --workflow-id=spotify-auth-workflow

# View error details
n8n executions:show <execution-id>

# Test webhook connectivity
curl -I ${N8N_WEBHOOK_URL}/health
```

## Performance Optimization

### Caching Strategy

- **Token Cache**: 90% of token lifetime
- **Genre Cache**: 1 hour TTL with daily refresh
- **Enhanced Playlists**: 30 minutes TTL
- **Error Metrics**: 24 hour retention

### Scalability

- **Horizontal**: Multiple N8N instances with load balancing
- **Vertical**: Resource allocation per workflow complexity
- **Queue Management**: Redis-based job queuing for heavy operations

### Monitoring KPIs

- **Response Times**: <1s for cached, <5s for fresh
- **Success Rates**: >95% for all workflows
- **Error Recovery**: <30s for retriable errors
- **Cache Hit Rates**: >80% for frequently accessed data