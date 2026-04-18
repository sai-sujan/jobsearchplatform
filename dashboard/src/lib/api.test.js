import { describe, it, expect, beforeEach } from 'vitest'
import { getStoredToken, storeToken, getCookieValue } from './api'

const TOKEN_KEY = 'jobapp.session.token'

beforeEach(() => {
  window.localStorage.clear()
  // Reset document.cookie between tests
  document.cookie.split(';').forEach((cookie) => {
    const key = cookie.split('=')[0].trim()
    document.cookie = `${key}=; expires=Thu, 01 Jan 1970 00:00:00 GMT`
  })
})

// ---------------------------------------------------------------------------
// storeToken / getStoredToken
// ---------------------------------------------------------------------------
describe('storeToken and getStoredToken', () => {
  it('stores a token and retrieves it', () => {
    storeToken('my-jwt-token')
    expect(getStoredToken()).toBe('my-jwt-token')
  })

  it('removes the token when called with empty string', () => {
    storeToken('some-token')
    storeToken('')
    expect(getStoredToken()).toBe('')
  })

  it('removes the token when called with null', () => {
    storeToken('some-token')
    storeToken(null)
    expect(getStoredToken()).toBe('')
  })

  it('returns empty string when nothing is stored', () => {
    expect(getStoredToken()).toBe('')
  })
})

// ---------------------------------------------------------------------------
// getCookieValue
// ---------------------------------------------------------------------------
describe('getCookieValue', () => {
  it('returns the value for a cookie that exists', () => {
    document.cookie = 'jobapp_csrf=test-csrf-value'
    expect(getCookieValue('jobapp_csrf')).toBe('test-csrf-value')
  })

  it('returns empty string when the cookie does not exist', () => {
    expect(getCookieValue('does_not_exist')).toBe('')
  })

  it('handles URL-encoded cookie values', () => {
    document.cookie = 'test_cookie=hello%20world'
    expect(getCookieValue('test_cookie')).toBe('hello world')
  })
})
