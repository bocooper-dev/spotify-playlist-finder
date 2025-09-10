import { describe, it, expect } from 'vitest'
import { $fetch } from '@nuxt/test-utils/e2e'
import type { SearchRequest, SearchResult, Playlist } from '~/types'

/**
 * Contract test for POST /api/spotify/search
 * Reference: api-contract.yaml lines 36-59
 * 
 * ⚠️ CRITICAL: This test MUST FAIL before implementation!
 * The endpoint does not exist yet - this validates the contract.
 */
describe('POST /api/spotify/search - Contract Test', () => {
  const validSearchRequest: SearchRequest = {
    id: 'test-search-001',
    genres: ['pop', 'rock'],
    minFollowers: 1000,
    timestamp: new Date().toISOString(),
    userId: 'test-user'
  }

  it('should accept valid SearchRequest and return SearchResult', async () => {
    // This test WILL FAIL - no implementation exists yet (TDD RED phase)
    const response = await $fetch('/api/spotify/search', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: validSearchRequest
    }) as SearchResult

    // Validate SearchResult schema per api-contract.yaml lines 52-53
    expect(response).toHaveProperty('requestId')
    expect(response).toHaveProperty('playlists')
    expect(response).toHaveProperty('totalFound')
    expect(response).toHaveProperty('searchMetadata')

    // Validate required fields
    expect(typeof response.requestId).toBe('string')
    expect(Array.isArray(response.playlists)).toBe(true)
    expect(typeof response.totalFound).toBe('number')
    expect(typeof response.searchMetadata).toBe('object')

    // Validate playlists array (should be exactly 50 or fewer)
    expect(response.playlists.length).toBeLessThanOrEqual(50)
    
    if (response.playlists.length > 0) {
      const playlist = response.playlists[0] as Playlist
      
      // Validate Playlist schema compliance
      expect(playlist).toHaveProperty('id')
      expect(playlist).toHaveProperty('name')
      expect(playlist).toHaveProperty('url')
      expect(playlist).toHaveProperty('followerCount')
      expect(playlist).toHaveProperty('owner')
      expect(playlist).toHaveProperty('genres')
      
      // Type validation
      expect(typeof playlist.id).toBe('string')
      expect(typeof playlist.name).toBe('string')
      expect(typeof playlist.url).toBe('string')
      expect(typeof playlist.followerCount).toBe('number')
      expect(typeof playlist.owner).toBe('object')
      expect(Array.isArray(playlist.genres)).toBe(true)
    }

    // Validate searchMetadata structure
    expect(response.searchMetadata).toHaveProperty('executionTime')
    expect(response.searchMetadata).toHaveProperty('genresSearched')
    expect(response.searchMetadata).toHaveProperty('apiCallsCount')
    expect(response.searchMetadata).toHaveProperty('cacheHit')
  })

  it('should validate SearchRequest fields', async () => {
    // Test validation with invalid request
    const invalidRequest = {
      genres: [], // Empty genres should fail
      minFollowers: -1, // Negative followers should fail
    }

    try {
      await $fetch('/api/spotify/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: invalidRequest
      })
      // Should not reach here
      expect(false).toBe(true)
    } catch (error: any) {
      // Should return 400 Bad Request per api-contract.yaml line 54-55
      expect(error.response?.status).toBe(400)
      expect(error.response?.data).toHaveProperty('code')
      expect(error.response?.data).toHaveProperty('message')
    }
  })

  it('should enforce genre limits (1-10 genres)', async () => {
    // Test with too many genres
    const tooManyGenres = {
      ...validSearchRequest,
      genres: Array(11).fill('pop') // 11 genres should fail
    }

    try {
      await $fetch('/api/spotify/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: tooManyGenres
      })
      expect(false).toBe(true) // Should not reach here
    } catch (error: any) {
      expect(error.response?.status).toBe(400)
    }
  })

  it('should handle rate limiting properly', async () => {
    // Test rate limiting response per api-contract.yaml line 56-57
    try {
      // Make multiple rapid requests to trigger rate limiting
      const requests = Array(10).fill(null).map(() =>
        $fetch('/api/spotify/search', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: validSearchRequest
        })
      )
      
      await Promise.all(requests)
    } catch (error: any) {
      if (error.response?.status === 429) {
        // Validate rate limit response structure
        expect(error.response.headers).toHaveProperty('retry-after')
        expect(error.response?.data).toHaveProperty('code')
        expect(error.response?.data).toHaveProperty('message')
      }
    }
  })

  it('should return exactly 50 playlists when available', async () => {
    const response = await $fetch('/api/spotify/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: {
        ...validSearchRequest,
        genres: ['pop'], // Popular genre should have many results
        minFollowers: 100 // Low threshold to ensure results
      }
    }) as SearchResult

    // Should return exactly 50 playlists per spec requirement
    expect(response.playlists.length).toBe(50)
    
    // All playlists should meet minimum follower requirement
    response.playlists.forEach(playlist => {
      expect(playlist.followerCount).toBeGreaterThanOrEqual(100)
    })
  })
})