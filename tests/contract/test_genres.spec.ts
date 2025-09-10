import { $fetch } from '@nuxt/test-utils/e2e'
import { describe, expect, it } from 'vitest'
import type { Genre } from '~/types'

/**
 * Contract test for GET /api/spotify/genres
 * Reference: api-contract.yaml lines 14-34
 *
 * ⚠️ CRITICAL: This test MUST FAIL before implementation!
 * The endpoint does not exist yet - this validates the contract.
 */
describe('GET /api/spotify/genres - Contract Test', () => {
  it('should return list of available genres with correct schema', async () => {
    // This test WILL FAIL - no implementation exists yet (TDD RED phase)
    const response = await $fetch('/api/spotify/genres', {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json'
      }
    })

    // Validate response structure per api-contract.yaml lines 25-32
    expect(response).toHaveProperty('genres')
    expect(response).toHaveProperty('total')
    expect(Array.isArray(response.genres)).toBe(true)
    expect(typeof response.total).toBe('number')

    // Validate Genre schema compliance
    if (response.genres.length > 0) {
      const genre = response.genres[0] as Genre

      // Required fields per Genre schema
      expect(genre).toHaveProperty('id')
      expect(genre).toHaveProperty('name')
      expect(genre).toHaveProperty('category')
      expect(genre).toHaveProperty('relatedGenres')
      expect(genre).toHaveProperty('isAvailable')

      // Type validation
      expect(typeof genre.id).toBe('string')
      expect(typeof genre.name).toBe('string')
      expect(typeof genre.category).toBe('string')
      expect(Array.isArray(genre.relatedGenres)).toBe(true)
      expect(typeof genre.isAvailable).toBe('boolean')
    }

    // Validate total count matches array length
    expect(response.total).toBe(response.genres.length)
  })

  it('should handle server errors with proper error response', async () => {
    // Test 500 error response structure per api-contract.yaml line 33-34
    try {
      // Force error by making request when server is down or endpoint fails
      await $fetch('/api/spotify/genres?forceerror=true')
    } catch (error) {
      // Validate error response structure
      expect(error.response?.status).toBe(500)
      expect(error.response?.data).toHaveProperty('code')
      expect(error.response?.data).toHaveProperty('message')
    }
  })

  it('should return genres that include Spotify official genres', async () => {
    const response = await $fetch('/api/spotify/genres')

    // Should include common Spotify genres
    const genreNames = response.genres.map((g: Genre) => g.name.toLowerCase())
    const commonGenres = ['pop', 'rock', 'hip-hop', 'electronic', 'jazz']

    // At least some common genres should be present
    const hasCommonGenres = commonGenres.some(genre =>
      genreNames.some(name => name.includes(genre))
    )
    expect(hasCommonGenres).toBe(true)
  })
})
