# Spotify Playlist Scraper Actor

## Overview

This Apify actor complements the Spotify Web API by scraping additional playlist metadata that requires browser rendering to access. It extracts enhanced owner information, real-time metrics, and detailed track data for genre classification.

## Features

- **Enhanced Playlist Data**: Scrapes metadata not available via Web API
- **Owner Profile Information**: Detailed owner stats and verification status  
- **Track Sampling**: Extracts track samples for genre classification
- **Anti-Detection**: Uses residential proxies and session rotation
- **Error Handling**: Comprehensive retry logic and error reporting
- **Rate Limiting**: Built-in delays to respect Spotify's limits

## Input Schema

```json
{
  "playlistIds": ["37i9dQZF1DXcBWIGoYBM5M", "37i9dQZF1DX0XUsuxWHRQd"],
  "maxConcurrency": 3,
  "requestDelay": 2000,
  "retryCount": 3,
  "proxy": {
    "useApifyProxy": true,
    "apifyProxyCountry": "US"
  },
  "includeOwnerProfile": true,
  "includeTrackSample": true,
  "trackSampleSize": 10
}
```

### Required Parameters

- `playlistIds` (array): Array of Spotify playlist IDs to scrape

### Optional Parameters

- `maxConcurrency` (integer, 1-10, default: 3): Maximum concurrent requests
- `requestDelay` (integer, 1000-10000ms, default: 2000): Delay between requests
- `retryCount` (integer, 0-5, default: 3): Retry attempts for failed requests
- `proxy` (object): Proxy configuration for anti-detection
- `includeOwnerProfile` (boolean, default: true): Scrape owner profile data
- `includeTrackSample` (boolean, default: true): Include track samples
- `trackSampleSize` (integer, 1-50, default: 10): Number of tracks to sample

## Output Schema

```json
{
  "playlistId": "37i9dQZF1DXcBWIGoYBM5M",
  "title": "Today's Top Hits",
  "description": "The most played tracks on Spotify.",
  "coverImage": "https://i.scdn.co/image/...",
  "ownerName": "Spotify",
  "ownerLink": "/user/spotify",
  "followerCount": 32000000,
  "trackCount": 50,
  "duration": 180,
  "tracks": [
    {
      "title": "Anti-Hero",
      "artist": "Taylor Swift", 
      "duration": "3:20"
    }
  ],
  "isPublic": true,
  "lastUpdated": "2025-09-10",
  "ownerProfile": {
    "displayName": "Spotify",
    "followerCount": "500K followers",
    "profileImage": "https://i.scdn.co/image/...",
    "playlistCount": "100+ playlists",
    "isVerified": true
  },
  "url": "https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M",
  "scrapedAt": "2025-09-10T12:00:00.000Z",
  "scrapeStatus": "success"
}
```

## Error Handling

The actor handles various error scenarios:

- **Network timeouts**: Automatic retries with exponential backoff
- **Anti-bot detection**: Session rotation and proxy switching
- **Rate limiting**: Built-in delays and respect for Spotify's limits
- **Invalid playlists**: Graceful handling of private/deleted playlists
- **Parsing errors**: Fallback extraction methods

Failed scrapes return error objects:

```json
{
  "playlistId": "invalid123",
  "scrapeStatus": "error",
  "errorMessage": "Playlist not found or private",
  "url": "https://open.spotify.com/playlist/invalid123",
  "scrapedAt": "2025-09-10T12:00:00.000Z"
}
```

## Usage in N8N Workflow

The actor integrates with N8N workflows for automated data collection:

1. **Trigger**: Spotify Web API search returns playlist IDs
2. **Batch Processing**: Split large ID lists into smaller chunks
3. **Scraping**: Run Apify actor with playlist ID batches
4. **Data Merge**: Combine API and scraped data
5. **Validation**: Validate and clean scraped data
6. **Storage**: Cache results in Redis/database

## Rate Limiting & Best Practices

- **Concurrency**: Keep maxConcurrency ≤ 3 to avoid detection
- **Delays**: Use 2000ms+ delays between requests
- **Proxy Rotation**: Enable Apify proxy for IP rotation
- **Session Management**: Let actor handle session rotation
- **Batch Size**: Process ≤ 50 playlists per run
- **Monitoring**: Check actor logs for blocked sessions

## Local Development

```bash
# Install dependencies
npm install

# Set environment variables
export APIFY_TOKEN="your-apify-token"

# Run locally with test input
echo '{"playlistIds":["37i9dQZF1DXcBWIGoYBM5M"]}' | node main.js
```

## Deployment

1. **Upload to Apify**: Create new actor and upload source code
2. **Configure Environment**: Set any required environment variables  
3. **Test Run**: Execute with small test dataset
4. **Monitor Performance**: Check success rates and adjust settings
5. **Integration**: Configure webhook/API calls from N8N workflows

## Compliance & Ethics

This actor is designed for legitimate research and playlist discovery purposes. It:

- **Respects robots.txt**: Only accesses publicly available data
- **Rate Limiting**: Implements delays to avoid server overload
- **No Personal Data**: Only scrapes publicly displayed information
- **Terms Compliance**: Operates within Spotify's acceptable use policies

## Support & Monitoring

- **Logs**: Check Apify console for execution logs
- **Metrics**: Monitor success rates and error patterns
- **Alerts**: Set up notifications for failed runs
- **Updates**: Regular updates for selector changes