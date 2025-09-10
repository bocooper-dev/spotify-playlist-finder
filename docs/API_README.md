# Spotify Playlist Discovery API

A RESTful API for discovering popular Spotify playlists by genre with owner contact information.

## 🚀 Quick Start

### Base URL
```
https://your-domain.com/api
```

### Interactive Documentation
Visit `/api/docs` for interactive API documentation with Swagger UI.

## 📊 Endpoints Overview

| Endpoint | Method | Description | Rate Limit |
|----------|--------|-------------|------------|
| `/spotify/genres` | GET | Get available genres | 100/min |
| `/spotify/search` | POST | Search playlists by genre | 20/min |
| `/spotify/playlist/:id` | GET | Get playlist details | 100/min |
| `/export` | POST | Export results to JSON/CSV | 3/5min |
| `/health` | GET | API health check | 200/min |
| `/metrics` | GET | Prometheus metrics | Auth required |

## 🎵 Core Features

- **Exact Results**: Always returns exactly 50 playlists
- **Owner Contact**: Includes playlist owner contact information
- **Smart Filtering**: Filter by follower count and market
- **Export Options**: JSON and CSV export formats
- **Caching**: Intelligent caching for performance
- **Rate Limiting**: Per-endpoint rate limiting
- **Error Recovery**: Automatic retry and fallback mechanisms

## 📝 API Usage Examples

### 1. Get Available Genres

```bash
curl -X GET "https://your-domain.com/api/spotify/genres"
```

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "name": "pop",
      "displayName": "Pop",
      "relatedGenres": ["dance-pop", "electropop", "indie-pop"]
    }
  ],
  "metadata": {
    "totalGenres": 126,
    "cached": false,
    "responseTime": 150,
    "requestId": "genres_1234567890_abcdef"
  }
}
```

### 2. Search Playlists

```bash
curl -X POST "https://your-domain.com/api/spotify/search" \
  -H "Content-Type: application/json" \
  -d '{
    "genres": ["pop", "rock"],
    "minFollowers": 1000,
    "market": "US",
    "enhanceWithScraping": false
  }'
```

**Response:**
```json
{
  "success": true,
  "data": {
    "requestId": "search_1234567890_abcdef",
    "playlists": [
      {
        "id": "37i9dQZF1DXcBWIGoYBM5M",
        "name": "Today's Top Hits",
        "description": "The most played tracks on Spotify",
        "url": "https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M",
        "followerCount": 32000000,
        "trackCount": 50,
        "owner": {
          "id": "spotify",
          "displayName": "Spotify",
          "profileUrl": "https://open.spotify.com/user/spotify",
          "contactInfo": {
            "username": "spotify",
            "profileUrl": "https://open.spotify.com/user/spotify",
            "isContactPublic": true,
            "contactStatus": "public"
          }
        },
        "genres": ["pop", "top hits"],
        "popularity": 100,
        "isPublic": true
      }
    ],
    "totalFound": 50,
    "searchMetadata": {
      "executionTime": 1500,
      "genresSearched": ["pop", "rock"],
      "apiCallsCount": 3,
      "cacheHit": false
    }
  },
  "metadata": {
    "totalPlaylists": 50,
    "executionTime": 1500,
    "cached": false,
    "requestId": "search_1234567890_abcdef"
  }
}
```

### 3. Get Playlist Details

```bash
curl -X GET "https://your-domain.com/api/spotify/playlist/37i9dQZF1DXcBWIGoYBM5M"
```

### 4. Export Results

```bash
# Export as JSON
curl -X POST "https://your-domain.com/api/export" \
  -H "Content-Type: application/json" \
  -d '{
    "format": "json",
    "data": {
      "requestId": "search_123",
      "playlists": [...],
      "searchMetadata": {...}
    }
  }'

# Export as CSV
curl -X POST "https://your-domain.com/api/export" \
  -H "Content-Type: application/json" \
  -d '{
    "format": "csv",
    "data": {...}
  }' \
  --output playlists.csv
```

## 🔒 Authentication & Security

### Rate Limiting
- **Per-IP rate limiting** with different limits per endpoint
- **Burst protection** with intelligent backoff
- **Rate limit headers** included in all responses:
  - `X-RateLimit-Limit`: Requests allowed per window
  - `X-RateLimit-Remaining`: Remaining requests
  - `X-RateLimit-Reset`: Window reset time
  - `Retry-After`: Seconds to wait when limited

### Security Features
- **Request validation** and sanitization
- **CORS protection** with allowed origins
- **Security headers** (CSP, XSS protection, etc.)
- **Request size limits** (10MB max)
- **Suspicious pattern detection**

## ⚡ Performance Features

### Caching Strategy
- **Multi-tier caching**: Memory, Redis, Browser
- **Smart TTLs**: Different cache times per endpoint
  - Genres: 1 hour
  - Playlists: 30 minutes  
  - Search results: 15 minutes
- **Cache headers**: `Cache-Control`, `Vary`, `ETag`
- **Cache warming**: Proactive cache population

### Response Optimization
- **Gzip compression** for JSON responses
- **Response streaming** for large datasets
- **Pagination** support for large result sets
- **Field selection** to reduce payload size

## 📊 Monitoring & Observability

### Health Monitoring
```bash
curl -X GET "https://your-domain.com/api/health"
```

Returns system health including:
- Service status (healthy/degraded/unhealthy)
- Dependency health (Spotify API, Redis, etc.)
- Performance metrics
- Resource usage

### Metrics (Prometheus Format)
```bash
curl -X GET "https://your-domain.com/api/metrics" \
  -H "Authorization: Bearer YOUR_METRICS_KEY"
```

Provides metrics for:
- Request rates and response times
- Error rates by type and endpoint
- Cache hit rates and sizes
- Rate limiting statistics
- System resource usage

## 🚨 Error Handling

### Error Response Format
```json
{
  "success": false,
  "error": {
    "code": "INVALID_GENRE",
    "message": "One or more genres are invalid",
    "suggestions": ["Check genre spelling", "Use /api/spotify/genres"],
    "retryable": false
  },
  "requestId": "req_1234567890_abcdef"
}
```

### Common Error Codes
- `VALIDATION_ERROR`: Invalid request parameters
- `RATE_LIMIT_ERROR`: Rate limit exceeded
- `AUTH_ERROR`: Authentication failed
- `SPOTIFY_API_ERROR`: Spotify service error
- `NETWORK_ERROR`: Connection issues
- `BUSINESS_LOGIC_ERROR`: Business rule violations

### Error Recovery
- **Automatic retries** with exponential backoff
- **Circuit breakers** for failing services  
- **Graceful degradation** with cached data
- **Detailed error tracking** for debugging

## 🔧 Integration Examples

### JavaScript/TypeScript
```typescript
interface SearchRequest {
  genres: string[]
  minFollowers?: number
  maxFollowers?: number
  market?: string
  enhanceWithScraping?: boolean
}

async function searchPlaylists(request: SearchRequest) {
  const response = await fetch('/api/spotify/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request)
  })
  
  if (!response.ok) {
    throw new Error(`Search failed: ${response.statusText}`)
  }
  
  return await response.json()
}
```

### Python
```python
import requests

def search_playlists(genres, min_followers=None, market="US"):
    response = requests.post(
        "https://your-domain.com/api/spotify/search",
        json={
            "genres": genres,
            "minFollowers": min_followers,
            "market": market
        }
    )
    response.raise_for_status()
    return response.json()

# Example usage
result = search_playlists(["pop", "rock"], min_followers=1000)
playlists = result["data"]["playlists"]
```

### cURL Scripts
```bash
#!/bin/bash
# Search and export playlists

# 1. Search for playlists
SEARCH_RESULT=$(curl -s -X POST "https://your-domain.com/api/spotify/search" \
  -H "Content-Type: application/json" \
  -d '{"genres": ["electronic"], "minFollowers": 5000}')

# 2. Export to CSV
echo "$SEARCH_RESULT" | curl -s -X POST "https://your-domain.com/api/export" \
  -H "Content-Type: application/json" \
  -d @- \
  -o electronic_playlists.csv

echo "Exported playlists to electronic_playlists.csv"
```

## 📈 Performance Guidelines

### Optimization Tips
1. **Use caching**: Check `X-Cache-Status` header
2. **Batch requests**: Combine multiple operations
3. **Respect rate limits**: Check rate limit headers
4. **Use appropriate markets**: Specify user's market
5. **Enable compression**: Set `Accept-Encoding: gzip`

### Best Practices
1. **Error handling**: Always handle error responses
2. **Request IDs**: Log `requestId` for debugging
3. **Timeouts**: Set reasonable request timeouts
4. **Retry logic**: Implement exponential backoff
5. **Monitoring**: Track API usage and performance

## 🔗 Related Resources

- **OpenAPI Spec**: `/api/docs?format=json`
- **Health Check**: `/api/health`
- **Metrics**: `/api/metrics`
- **Status Page**: https://status.your-domain.com
- **Support**: support@your-domain.com

## 📋 Changelog

### v1.0.0 (2025-09-10)
- Initial API release
- All core endpoints implemented
- Rate limiting and caching
- Error handling and monitoring
- Interactive documentation

---

For more detailed information, visit the [interactive API documentation](/api/docs).