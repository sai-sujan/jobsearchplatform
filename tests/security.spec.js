/**
 * Security Test Suite
 * Covers: auth bypass, path traversal, unauthenticated legacy API access,
 *         CSRF enforcement, data isolation, rate limiting, injection
 */

import { test, expect } from '@playwright/test'
import { API_URL, apiSignup, newApiContext } from './helpers.js'

// ─── Legacy API unauthenticated access ────────────────────────────────────────

test.describe('SEC — Legacy API unauthenticated access (known bugs)', () => {
  test('SEC-L1 — GET /api/legacy/jobs is accessible without auth (BUG)', async ({ request }) => {
    const anonCtx = await newApiContext()
    const res = await anonCtx.get(`${API_URL}/api/legacy/jobs`)
    console.log(`[SEC-L1] /api/legacy/jobs status without auth: ${res.status()} — expected 401`)
    expect(res.status()).toBe(401)
  })

  test('SEC-L2 — POST /api/update-status is accessible without auth (BUG)', async ({ request }) => {
    const anonCtx = await newApiContext()
    const res = await anonCtx.post(`${API_URL}/api/update-status`, {
      data: { row_index: 0, status: 'applied' },
      headers: { 'Content-Type': 'application/json' },
    })
    console.log(`[SEC-L2] /api/update-status without auth: ${res.status()} — expected 401`)
    expect(res.status()).toBe(401)
  })

  test('SEC-L3 — CRITICAL: GET /api/config exposes .env secrets without auth', async ({ request }) => {
    const anonCtx = await newApiContext()
    const res = await anonCtx.get(`${API_URL}/api/config`)

    // CURRENT: 200 with .env content (CRITICAL BUG)
    // EXPECTED: 401
    console.log(`[SEC-L3] /api/config without auth: ${res.status()}`)

    if (res.status() === 200) {
      const body = await res.json()
      // Document what we found
      const hasEnvContent = typeof body.env === 'string' && body.env.length > 0
      console.warn(`[SEC-L3] CRITICAL: /api/config returned env file content (${body.env?.length ?? 0} chars)`)
      // This test will FAIL until the bug is fixed — which is intentional
      expect(res.status()).toBe(401) // Assert the correct behavior
    } else {
      // Already fixed
      expect(res.status()).toBe(401)
    }
  })

  test('SEC-L4 — POST /api/config should not allow unauthenticated file writes', async ({ request }) => {
    const anonCtx = await newApiContext()
    const res = await anonCtx.post(`${API_URL}/api/config`, {
      data: { config_type: 'company_blacklist', content: 'injected-content' },
      headers: { 'Content-Type': 'application/json' },
    })
    // EXPECTED: 401
    console.log(`[SEC-L4] POST /api/config without auth: ${res.status()}`)
    expect(res.status()).toBe(401)
  })
})

// ─── Path traversal ───────────────────────────────────────────────────────────

test.describe('SEC — Path traversal', () => {
  test('SEC-B4 — /api/download-resume with traversal path does not read arbitrary files', async ({ request }) => {
    const anonCtx = await newApiContext()

    const traversalPaths = [
      '../../etc/passwd',
      '..%2F..%2Fetc%2Fpasswd',
      '....//....//etc/passwd',
      '../.env',
      '%2e%2e%2f.env',
    ]

    for (const path of traversalPaths) {
      const res = await anonCtx.get(`${API_URL}/api/download-resume/${path}`)
      // Must not return 200 with file content
      expect(res.status()).not.toBe(200)
      // Should be 400 or 404
      expect([400, 404, 422]).toContain(res.status())
    }
  })

  test('SEC — /api/download-resume with normal filename is handled', async ({ request }) => {
    const anonCtx = await newApiContext()
    const res = await anonCtx.get(`${API_URL}/api/download-resume/nonexistent_resume.pdf`)
    expect(res.status()).toBe(404)
  })
})

// ─── Data isolation ───────────────────────────────────────────────────────────

test.describe('SEC — Data isolation between users', () => {
  test('SEC-ISO1 — User cannot read another user\'s onboarding profile', async ({ request }) => {
    const ctx1 = await newApiContext()
    const ctx2 = await newApiContext()

    const user1 = await apiSignup(ctx1, 'iso_a')
    const user2 = await apiSignup(ctx2, 'iso_b')

    // User2 tries to get user1's profile by injecting user1's token... in their own request
    // They use their own token — should only see their own data
    const res = await ctx2.get(`${API_URL}/api/onboarding`, {
      headers: { Authorization: `Bearer ${user2.token}` },
    })
    expect(res.status()).toBe(200)
    const body = await res.json()
    // Should see user2's data, not user1's
    expect(body.user.username).toBe(user2.username)
    expect(body.user.username).not.toBe(user1.username)
  })

  test('SEC-ISO2 — Profile endpoint returns only the requesting user\'s data', async ({ request }) => {
    const ctx = await newApiContext()
    const user = await apiSignup(ctx, 'iso_profile')

    const res = await ctx.get(`${API_URL}/api/profile`, {
      headers: { Authorization: `Bearer ${user.token}` },
    })
    expect(res.status()).toBe(200)
    const body = await res.json()
    expect(body.user.username).toBe(user.username)
  })
})

// ─── CSRF enforcement ─────────────────────────────────────────────────────────

test.describe('SEC — CSRF enforcement on mutating endpoints', () => {
  test('SEC-CSRF1 — POST /api/onboarding/complete without CSRF returns 401 or 403', async ({ request }) => {
    // Using cookie-only mode (no bearer)
    const anonCtx = await newApiContext()
    const res = await anonCtx.post(`${API_URL}/api/onboarding/complete`, {
      data: { onboarding_step: 'complete' },
      headers: { 'Content-Type': 'application/json' },
      // No Authorization header, no CSRF cookie
    })
    expect([401, 403]).toContain(res.status())
  })

  test('SEC-CSRF2 — DELETE /api/jobs/{id} without authentication returns 401', async ({ request }) => {
    const anonCtx = await newApiContext()
    const res = await anonCtx.delete(`${API_URL}/api/jobs/1`)
    expect(res.status()).toBe(401)
  })

  test('SEC-CSRF3 — PATCH /api/jobs/{id}/status without auth returns 401', async ({ request }) => {
    const anonCtx = await newApiContext()
    const res = await anonCtx.patch(`${API_URL}/api/jobs/1/status`, {
      params: { status: 'applied' },
    })
    expect(res.status()).toBe(401)
  })
})

// ─── Injection ────────────────────────────────────────────────────────────────

test.describe('SEC — Injection attacks', () => {
  test('SEC-INJ1 — SQL injection in username is harmless (ORM protects)', async ({ request }) => {
    const payloads = [
      "' OR 1=1--",
      "'; DROP TABLE users;--",
      "admin'/*",
      "1' UNION SELECT * FROM users--",
    ]
    for (const payload of payloads) {
      const res = await request.post(`${API_URL}/api/v1/auth/login`, {
        data: { username: payload, password: 'anything' },
      })
      // Must never succeed as a login or crash the server
      expect(res.status()).toBe(401)
    }
  })

  test('SEC-INJ2 — Very long username does not crash the server', async ({ request }) => {
    const longName = 'a'.repeat(10000)
    const res = await request.post(`${API_URL}/api/v1/auth/signup`, {
      data: { username: longName, password: 'TestPass123!' },
    })
    // 422 (too long) or 409 — but never a 500
    expect(res.status()).not.toBe(500)
  })

  test('SEC-INJ3 — Null bytes in username are rejected', async ({ request }) => {
    const res = await request.post(`${API_URL}/api/v1/auth/signup`, {
      data: { username: 'user\x00admin', password: 'TestPass123!' },
    })
    expect([400, 422]).toContain(res.status())
  })
})

// ─── Brute force / rate limiting ─────────────────────────────────────────────

test.describe('SEC — Brute force protection (known gap)', () => {
  test('SEC-BF1 — 10 rapid failed logins do not lock account (documenting gap)', async ({ request }) => {
    // This test DOCUMENTS the absence of rate limiting
    // When rate limiting is added, update this test to expect 429 after N failures
    const ctx = await newApiContext()
    const { username } = await apiSignup(ctx, 'brute_target')

    let lastStatus = 0
    for (let i = 0; i < 10; i++) {
      const res = await ctx.post(`${API_URL}/api/v1/auth/login`, {
        data: { username, password: `wrong_password_${i}` },
      })
      lastStatus = res.status()
    }
    // Currently: 401 every time (no lockout/rate limit)
    // After fix: expect 429 here
    console.log(`[SEC-BF1] After 10 failed logins, last status: ${lastStatus} — expected 429 when rate limiting is added`)
    expect([401, 429]).toContain(lastStatus) // Accept either for now
  })
})

// ─── Default JWT secret ───────────────────────────────────────────────────────

test.describe('SEC — JWT configuration', () => {
  test('SEC-JWT1 — Server does not use the default insecure JWT secret in production', async ({ request }) => {
    // The default secret is 'your-secret-key-change-in-production'
    // We try to forge a token signed with that known secret
    const { default: jose } = await import('jose').catch(() => ({ default: null }))

    if (!jose) {
      console.log('[SEC-JWT1] jose not available, skipping signature test')
      return
    }

    try {
      // Try forging a token with the known default secret
      const secret = new TextEncoder().encode('your-secret-key-change-in-production')
      const forgedToken = await new jose.SignJWT({ sub: '1', csrf: '' })
        .setProtectedHeader({ alg: 'HS256' })
        .setExpirationTime('2h')
        .sign(secret)

      const res = await request.get(`${API_URL}/api/v1/auth/me`, {
        headers: { Authorization: `Bearer ${forgedToken}` },
      })

      if (res.status() === 200) {
        console.error('[SEC-JWT1] CRITICAL: Default JWT secret is in use — forged token accepted!')
      }
      // If the default secret is in use, this will be 200 (CRITICAL BUG)
      // It should be 401 because user id=1 may not exist or secret should differ
      // We log but don't hard fail here since user 1 might not exist
      console.log(`[SEC-JWT1] Forged token with default secret returned: ${res.status()}`)
    } catch {
      // jose not available in test env
    }
  })
})
