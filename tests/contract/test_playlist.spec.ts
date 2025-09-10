import { $fetch } from '@nuxt/test-utils/e2e'
import { describe, expect, it } from 'vitest'
import type { ContactInfo, Playlist, PlaylistOwner } from '~/types'

/**
 * Contract test for GET /api/spotify/playlist/:id
 * Reference: api-contract.yaml lines 61-80
 *
 * ⚠️ CRITICAL: This test MUST FAIL before implementation!
 * The endpoint does not exist yet - this validates the contract.
 */
describe('GET /api/spotify/playlist/:id - Contract Test', () => {
  const testPlaylistId = '37i9dQZF1DXcBWIGoYBM5M' // Example Spotify playlist ID

  it('should return playlist details with complete schema', async () => {
    // This test WILL FAIL - no implementation exists yet (TDD RED phase)
    const response = await $fetch(`/api/spotify/playlist/${testPlaylistId}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json'
      }
    }) as Playlist

    // Validate Playlist schema per api-contract.yaml lines 77-78
    expect(response).toHaveProperty('id')
    expect(response).toHaveProperty('name')
    expect(response).toHaveProperty('url')
    expect(response).toHaveProperty('externalUrl')
    expect(response).toHaveProperty('followerCount')
    expect(response).toHaveProperty('trackCount')
    expect(response).toHaveProperty('owner')
    expect(response).toHaveProperty('genres')
    expect(response).toHaveProperty('popularity')
    expect(response).toHaveProperty('lastUpdated')
    expect(response).toHaveProperty('isPublic')

    // Type validation for required fields
    expect(typeof response.id).toBe('string')
    expect(typeof response.name).toBe('string')
    expect(typeof response.url).toBe('string')
    expect(typeof response.externalUrl).toBe('string')
    expect(typeof response.followerCount).toBe('number')
    expect(typeof response.trackCount).toBe('number')
    expect(typeof response.owner).toBe('object')
    expect(Array.isArray(response.genres)).toBe(true)
    expect(typeof response.popularity).toBe('number')
    expect(typeof response.lastUpdated).toBe('string')
    expect(typeof response.isPublic).toBe('boolean')

    // Validate nullable fields
    expect(response.description === null || typeof response.description === 'string').toBe(true)
    expect(response.imageUrl === null || typeof response.imageUrl === 'string').toBe(true)
  })

  it('should include complete PlaylistOwner information', async () => {
    const response = await $fetch(`/api/spotify/playlist/${testPlaylistId}`) as Playlist
    const owner = response.owner as PlaylistOwner

    // Validate PlaylistOwner schema
    expect(owner).toHaveProperty('id')
    expect(owner).toHaveProperty('displayName')
    expect(owner).toHaveProperty('profileUrl')
    expect(owner).toHaveProperty('contactInfo')

    // Type validation
    expect(typeof owner.id).toBe('string')
    expect(typeof owner.displayName).toBe('string')
    expect(typeof owner.profileUrl).toBe('string')
    expect(typeof owner.contactInfo).toBe('object')

    // Validate nullable fields
    expect(owner.imageUrl === null || typeof owner.imageUrl === 'string').toBe(true)
    expect(owner.followerCount === null || typeof owner.followerCount === 'number').toBe(true)
  })

  it('should include ContactInfo with all required fields', async () => {
    const response = await $fetch(`/api/spotify/playlist/${testPlaylistId}`) as Playlist
    const contactInfo = response.owner.contactInfo as ContactInfo

    // Validate ContactInfo schema
    expect(contactInfo).toHaveProperty('username')
    expect(contactInfo).toHaveProperty('profileUrl')
    expect(contactInfo).toHaveProperty('isContactPublic')
    expect(contactInfo).toHaveProperty('socialLinks')
    expect(contactInfo).toHaveProperty('contactStatus')

    // Type validation
    expect(typeof contactInfo.username).toBe('string')
    expect(typeof contactInfo.profileUrl).toBe('string')
    expect(typeof contactInfo.isContactPublic).toBe('boolean')
    expect(Array.isArray(contactInfo.socialLinks)).toBe(true)
    expect(['public', 'limited', 'private']).toContain(contactInfo.contactStatus)

    // Validate SocialLink structure if present
    if (contactInfo.socialLinks.length > 0) {
      const socialLink = contactInfo.socialLinks[0]
      expect(socialLink).toHaveProperty('platform')
      expect(socialLink).toHaveProperty('url')
      expect(socialLink).toHaveProperty('handle')
      expect(typeof socialLink.platform).toBe('string')
      expect(typeof socialLink.url).toBe('string')
      expect(typeof socialLink.handle).toBe('string')
    }
  })

  it('should return 404 for non-existent playlist', async () => {
    const nonExistentId = 'non-existent-playlist-id-12345'

    try {
      await $fetch(`/api/spotify/playlist/${nonExistentId}`)
      // Should not reach here
      expect(false).toBe(true)
    } catch (error) {
      // Should return 404 Not Found per api-contract.yaml line 79-80
      expect(error.response?.status).toBe(404)
      expect(error.response?.data).toHaveProperty('code')
      expect(error.response?.data).toHaveProperty('message')
    }
  })

  it('should validate playlist ID parameter format', async () => {
    const invalidId = '' // Empty ID should fail

    try {
      await $fetch(`/api/spotify/playlist/${invalidId}`)
      expect(false).toBe(true) // Should not reach here
    } catch (error) {
      // Should handle invalid ID appropriately
      expect([400, 404]).toContain(error.response?.status)
    }
  })

  it('should return valid Spotify URLs', async () => {
    const response = await $fetch(`/api/spotify/playlist/${testPlaylistId}`) as Playlist

    // Validate URL formats
    expect(response.url).toMatch(/^https:\/\/open\.spotify\.com\/playlist\//)
    expect(response.externalUrl).toMatch(/^spotify:playlist:/)
    expect(response.owner.profileUrl).toMatch(/^https:\/\/open\.spotify\.com\/user\//)
  })

  it('should return playlists with reasonable follower counts', async () => {
    const response = await $fetch(`/api/spotify/playlist/${testPlaylistId}`) as Playlist

    // Validate data ranges
    expect(response.followerCount).toBeGreaterThanOrEqual(0)
    expect(response.trackCount).toBeGreaterThanOrEqual(0)
    expect(response.popularity).toBeGreaterThanOrEqual(0)
    expect(response.popularity).toBeLessThanOrEqual(100) // Spotify popularity is 0-100
  })
})
