import { $fetch } from '@nuxt/test-utils/e2e'
import { describe, expect, it } from 'vitest'
import type { ExportData, SearchResult } from '~/types'

/**
 * Contract test for POST /api/export
 * Reference: api-contract.yaml lines 84-116
 *
 * ⚠️ CRITICAL: This test MUST FAIL before implementation!
 * The endpoint does not exist yet - this validates the contract.
 */
describe('POST /api/export - Contract Test', () => {
  const mockSearchResult: SearchResult = {
    requestId: 'test-request-123',
    playlists: [
      {
        id: '37i9dQZF1DXcBWIGoYBM5M',
        name: 'Today\'s Top Hits',
        description: 'The most played tracks on Spotify',
        url: 'https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M',
        externalUrl: 'spotify:playlist:37i9dQZF1DXcBWIGoYBM5M',
        imageUrl: 'https://i.scdn.co/image/example.jpg',
        followerCount: 32000000,
        trackCount: 50,
        owner: {
          id: 'spotify',
          displayName: 'Spotify',
          profileUrl: 'https://open.spotify.com/user/spotify',
          imageUrl: 'https://i.scdn.co/image/user.jpg',
          followerCount: 500000,
          contactInfo: {
            username: 'spotify',
            profileUrl: 'https://open.spotify.com/user/spotify',
            isContactPublic: true,
            socialLinks: [],
            contactStatus: 'public' as const
          }
        },
        genres: ['pop', 'top hits'],
        popularity: 100,
        lastUpdated: '2025-09-10T12:00:00Z',
        isPublic: true
      }
    ],
    totalFound: 1,
    searchMetadata: {
      executionTime: 1500,
      genresSearched: ['pop'],
      genresNotFound: [],
      apiCallsCount: 3,
      cacheHit: false,
      warnings: []
    }
  }

  it('should export search results as JSON format', async () => {
    // This test WILL FAIL - no implementation exists yet (TDD RED phase)
    const response = await $fetch('/api/export', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: {
        format: 'json',
        data: mockSearchResult
      }
    }) as ExportData

    // Validate ExportData schema per api-contract.yaml lines 113-114
    expect(response).toHaveProperty('metadata')
    expect(response).toHaveProperty('playlists')

    // Validate metadata structure
    expect(response.metadata).toHaveProperty('exportDate')
    expect(response.metadata).toHaveProperty('searchCriteria')
    expect(response.metadata).toHaveProperty('totalPlaylists')

    // Type validation
    expect(typeof response.metadata.exportDate).toBe('string')
    expect(typeof response.metadata.searchCriteria).toBe('object')
    expect(typeof response.metadata.totalPlaylists).toBe('number')
    expect(Array.isArray(response.playlists)).toBe(true)

    // Validate searchCriteria structure
    expect(response.metadata.searchCriteria).toHaveProperty('genres')
    expect(response.metadata.searchCriteria).toHaveProperty('minFollowers')
    expect(Array.isArray(response.metadata.searchCriteria.genres)).toBe(true)
    expect(typeof response.metadata.searchCriteria.minFollowers).toBe('number')

    // Validate playlist data transformation
    if (response.playlists.length > 0) {
      const playlist = response.playlists[0]
      expect(playlist).toHaveProperty('name')
      expect(playlist).toHaveProperty('url')
      expect(playlist).toHaveProperty('followers')
      expect(playlist).toHaveProperty('tracks')
      expect(playlist).toHaveProperty('ownerName')
      expect(playlist).toHaveProperty('ownerProfile')
      expect(playlist).toHaveProperty('ownerContact')
      expect(playlist).toHaveProperty('genres')
      expect(playlist).toHaveProperty('lastUpdated')
    }
  })

  it('should export search results as CSV format', async () => {
    const response = await fetch('/api/export', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        format: 'csv',
        data: mockSearchResult
      })
    })

    // Validate CSV response per api-contract.yaml lines 108-111
    expect(response.headers.get('content-type')).toContain('text/csv')
    expect(response.status).toBe(200)

    const csvContent = await response.text()

    // Validate CSV structure
    expect(typeof csvContent).toBe('string')
    expect(csvContent.length).toBeGreaterThan(0)

    // Should contain CSV headers
    const lines = csvContent.split('\n')
    expect(lines[0]).toContain('name') // Should have header row
    expect(lines[0]).toContain('url')
    expect(lines[0]).toContain('followers')
    expect(lines[0]).toContain('ownerName')

    // Should have data rows
    expect(lines.length).toBeGreaterThan(1)
  })

  it('should validate required request body fields', async () => {
    // Test missing format field
    try {
      await $fetch('/api/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: { data: mockSearchResult } // Missing format
      })
      expect(false).toBe(true) // Should not reach here
    } catch (error) {
      // Should return 400 Bad Request per api-contract.yaml line 115-116
      expect(error.response?.status).toBe(400)
      expect(error.response?.data).toHaveProperty('code')
      expect(error.response?.data).toHaveProperty('message')
    }

    // Test missing data field
    try {
      await $fetch('/api/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: { format: 'json' } // Missing data
      })
      expect(false).toBe(true) // Should not reach here
    } catch (error) {
      expect(error.response?.status).toBe(400)
    }
  })

  it('should validate format enum values', async () => {
    // Test invalid format
    try {
      await $fetch('/api/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: {
          format: 'xml', // Invalid format (not csv or json)
          data: mockSearchResult
        }
      })
      expect(false).toBe(true) // Should not reach here
    } catch (error) {
      // Should return 400 Bad Request for invalid enum value
      expect(error.response?.status).toBe(400)
      expect(error.response?.data?.message).toContain('format')
    }
  })

  it('should handle empty playlist data gracefully', async () => {
    const emptySearchResult: SearchResult = {
      ...mockSearchResult,
      playlists: [],
      totalFound: 0
    }

    const response = await $fetch('/api/export', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: {
        format: 'json',
        data: emptySearchResult
      }
    }) as ExportData

    // Should handle empty results gracefully
    expect(response.playlists).toEqual([])
    expect(response.metadata.totalPlaylists).toBe(0)
  })

  it('should preserve data integrity during export', async () => {
    const response = await $fetch('/api/export', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: {
        format: 'json',
        data: mockSearchResult
      }
    }) as ExportData

    // Verify data matches original
    expect(response.metadata.totalPlaylists).toBe(mockSearchResult.playlists.length)

    const originalPlaylist = mockSearchResult.playlists[0]
    const exportedPlaylist = response.playlists[0]

    expect(exportedPlaylist.name).toBe(originalPlaylist.name)
    expect(exportedPlaylist.url).toBe(originalPlaylist.url)
    expect(exportedPlaylist.followers).toBe(originalPlaylist.followerCount)
    expect(exportedPlaylist.tracks).toBe(originalPlaylist.trackCount)
    expect(exportedPlaylist.ownerName).toBe(originalPlaylist.owner.displayName)
  })
})
