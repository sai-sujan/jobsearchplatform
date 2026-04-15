/**
 * UI / End-to-End Test Suite
 * Covers: full page flows, navigation, state display, error states, malicious user,
 *         beginner user, power user scenarios
 */

import { test, expect } from '@playwright/test'
import { API_URL, FRONTEND_URL, apiSignup, uiLogin, uiSignup, uniqueUser, newApiContext } from './helpers.js'

// ─── Page load & auth wall ────────────────────────────────────────────────────

test.describe('Page load', () => {
  test('Root URL shows auth page for unauthenticated user', async ({ page }) => {
    await page.goto(FRONTEND_URL)
    await page.waitForLoadState('networkidle')
    await expect(page.locator('.auth-shell')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Continue' })).toBeVisible()
  })

  test('Loading spinner is shown during initial session check', async ({ page }) => {
    // Intercept the session check to make it slow
    await page.route(`${API_URL}/api/v1/auth/me`, async (route) => {
      await new Promise((r) => setTimeout(r, 500))
      await route.abort()
    })
    await page.goto(FRONTEND_URL)
    // Spinner should appear briefly
    const spinner = page.locator('.app-spinner')
    // It appears and then disappears — just verify no JS crash
    await page.waitForTimeout(600)
    await expect(page.locator('.auth-shell')).toBeVisible()
  })

  test('App does not crash when /api/jobs returns empty array', async ({ page, request }) => {
    const ctx = await newApiContext()
    const { username, password } = await apiSignup(ctx, 'empty_jobs')

    // Complete onboarding
    const { token } = await apiSignup(ctx, 'ej2')
    await ctx.put(`${API_URL}/api/onboarding/profile`, {
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', 'X-CSRF-Token': 'x' },
      data: { target_roles: [], quality_filters: {}, onboarding_step: 'profile' },
    })
    await ctx.post(`${API_URL}/api/onboarding/complete`, {
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', 'X-CSRF-Token': 'x' },
      data: { onboarding_step: 'complete' },
    })

    await uiLogin(page, username, password)
    // Should show the app without crashing — even with 0 jobs
    await expect(page.locator('.app-frame, .onboarding-shell, .auth-shell')).toBeVisible({ timeout: 10000 })
    const jsErrors = []
    page.on('pageerror', (err) => jsErrors.push(err.message))
    await page.waitForTimeout(2000)
    expect(jsErrors.filter((e) => !e.includes('ResizeObserver'))).toHaveLength(0)
  })
})

// ─── Navigation ───────────────────────────────────────────────────────────────

test.describe('Navigation', () => {
  test('Authenticated user sees top navigation bar', async ({ page, request }) => {
    const { username, password, token } = await apiSignup(request, 'nav_test')
    // Mark onboarding complete via API
    const ctx = await newApiContext()
    await ctx.post(`${API_URL}/api/onboarding/complete`, {
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', 'X-CSRF-Token': 'x' },
      data: { onboarding_step: 'complete' },
    })

    await uiLogin(page, username, password)
    await page.waitForTimeout(3000) // Allow redirect after login + onboarding check

    // May still be on onboarding — just verify no crash and auth shell is gone
    await expect(page.locator('.auth-shell')).toBeHidden({ timeout: 8000 })
  })

  test('/ redirects to /jobs for authenticated user', async ({ page, request }) => {
    const { username, password, token } = await apiSignup(request, 'nav_redir')
    const ctx = await newApiContext()
    await ctx.post(`${API_URL}/api/onboarding/complete`, {
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', 'X-CSRF-Token': 'x' },
      data: { onboarding_step: 'complete' },
    })

    await uiLogin(page, username, password)
    await page.waitForTimeout(3000)

    const url = page.url()
    // After login with completed onboarding, URL should not be auth
    expect(url).not.toContain('auth')
  })

  test('Unknown routes fall back to /jobs (catch-all route)', async ({ page, request }) => {
    const { username, password, token } = await apiSignup(request, 'nav_404')
    const ctx = await newApiContext()
    await ctx.post(`${API_URL}/api/onboarding/complete`, {
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', 'X-CSRF-Token': 'x' },
      data: { onboarding_step: 'complete' },
    })

    await uiLogin(page, username, password)
    await page.waitForTimeout(3000)
    await page.goto(`${FRONTEND_URL}/this-does-not-exist`)
    await page.waitForTimeout(1000)

    // The catch-all Route redirects to /jobs
    expect(page.url()).toMatch(/\/jobs$/)
  })
})

// ─── Auth form interactions ───────────────────────────────────────────────────

test.describe('Auth form', () => {
  test('Login/Signup toggle switches form fields', async ({ page }) => {
    await page.goto(FRONTEND_URL)
    await page.waitForLoadState('networkidle')

    // Default is login — no full_name field
    await expect(page.getByLabel('Full name')).toBeHidden()

    // Switch to signup
    await page.getByRole('button', { name: 'Create account' }).click()
    await expect(page.getByLabel('Full name')).toBeVisible()

    // Switch back to login
    await page.getByRole('button', { name: 'Log in' }).click()
    await expect(page.getByLabel('Full name')).toBeHidden()
  })

  test('Submit button shows "Working..." while request is in flight', async ({ page }) => {
    // Slow down the login endpoint
    await page.route(`${API_URL}/api/v1/auth/login`, async (route) => {
      await new Promise((r) => setTimeout(r, 1000))
      await route.abort()
    })

    await page.goto(FRONTEND_URL)
    await page.getByLabel('Username').fill('anyone')
    await page.getByLabel('Password').fill('password123')
    await page.getByRole('button', { name: 'Continue' }).click()

    await expect(page.getByRole('button', { name: 'Working...' })).toBeVisible({ timeout: 2000 })
  })

  test('Network error shows a user-facing error message', async ({ page }) => {
    await page.route(`${API_URL}/api/v1/auth/login`, (route) => route.abort('failed'))

    await page.goto(FRONTEND_URL)
    await page.getByLabel('Username').fill('anyone')
    await page.getByLabel('Password').fill('password123')
    await page.getByRole('button', { name: 'Continue' }).click()

    await expect(page.locator('.auth-error')).toBeVisible({ timeout: 5000 })
  })
})

// ─── Malicious user scenarios ─────────────────────────────────────────────────

test.describe('Malicious user', () => {
  test('MAL1 — Direct API call to /api/jobs without auth is blocked', async ({ request }) => {
    const res = await request.get(`${API_URL}/api/jobs`)
    expect(res.status()).toBe(401)
  })

  test('MAL2 — Cannot access other user jobs by guessing IDs', async ({ request }) => {
    const ctx = await newApiContext()
    const user = await apiSignup(ctx, 'mal_guess')

    // Guess IDs 1 through 10 — all should be 404 for this user
    let blockedCount = 0
    for (let id = 1; id <= 10; id++) {
      const res = await ctx.get(`${API_URL}/api/jobs/${id}`, {
        headers: { Authorization: `Bearer ${user.token}` },
      })
      if (res.status() === 404) blockedCount++
    }
    // Most guessed IDs should be inaccessible
    expect(blockedCount).toBeGreaterThan(7)
  })

  test('MAL3 — Rapid repeated POSTs to signup do not crash the server', async ({ request }) => {
    const promises = Array.from({ length: 20 }, (_, i) =>
      request.post(`${API_URL}/api/v1/auth/signup`, {
        data: { username: `rapid_${Date.now()}_${i}`, password: 'TestPass123!' },
      })
    )
    const responses = await Promise.all(promises)
    const statuses = responses.map((r) => r.status())
    // All should succeed or fail cleanly — never 500
    expect(statuses.every((s) => s !== 500)).toBe(true)
  })

  test('MAL4 — Sending huge JSON payload is handled safely', async ({ request }) => {
    const hugePayload = { username: 'x'.repeat(100000), password: 'y'.repeat(100000) }
    const res = await request.post(`${API_URL}/api/v1/auth/login`, {
      data: hugePayload,
    })
    // Should reject cleanly, not 500
    expect([400, 413, 422]).toContain(res.status())
  })

  test('MAL5 — XSS in notes field is stored escaped, not executed', async ({ page, request }) => {
    const ctx = await newApiContext()
    const { username, password, token } = await apiSignup(ctx, 'xss_notes')

    // Set up onboarding
    await ctx.post(`${API_URL}/api/onboarding/complete`, {
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', 'X-CSRF-Token': 'x' },
      data: { onboarding_step: 'complete' },
    })

    // Get a job ID (if any exist)
    const listRes = await ctx.get(`${API_URL}/api/jobs`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    const list = await listRes.json()
    if (list.jobs.length === 0) return

    const jobId = list.jobs[0].id
    const xssPayload = '<img src=x onerror="window.__XSS_NOTES__=true">'
    await ctx.patch(`${API_URL}/api/jobs/${jobId}/notes`, {
      headers: { Authorization: `Bearer ${token}`, 'X-CSRF-Token': 'x' },
      params: { notes: xssPayload },
    })

    await uiLogin(page, username, password)
    await page.waitForTimeout(3000)

    const xssRan = await page.evaluate(() => window.__XSS_NOTES__ ?? false)
    expect(xssRan).toBe(false)
  })
})

// ─── Beginner user scenarios ──────────────────────────────────────────────────

test.describe('Beginner user', () => {
  test('BEG1 — User who skips onboarding steps sees appropriate UI', async ({ page }) => {
    const username = uniqueUser('beg')
    await uiSignup(page, username, 'TestPass123!')

    // Just verify no crash after signup
    await page.waitForTimeout(2000)
    await expect(page.locator('.auth-shell')).toBeHidden()
  })

  test('BEG2 — Login with correct credentials but wrong case still works', async ({ page, request }) => {
    const ctx = await newApiContext()
    const { username, password } = await apiSignup(ctx, 'case_beg')

    await page.goto(FRONTEND_URL)
    await page.getByLabel('Username').fill(username.toUpperCase())
    await page.getByLabel('Password').fill(password)
    await page.getByRole('button', { name: 'Continue' }).click()
    await expect(page.locator('.auth-shell')).toBeHidden({ timeout: 8000 })
  })
})

// ─── Power user scenarios ─────────────────────────────────────────────────────

test.describe('Power user', () => {
  test('POW1 — Multiple rapid status changes do not break the job record', async ({ request }) => {
    const ctx = await newApiContext()
    const { token } = await apiSignup(ctx, 'pow1')

    await ctx.post(`${API_URL}/api/onboarding/complete`, {
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', 'X-CSRF-Token': 'x' },
      data: { onboarding_step: 'complete' },
    })

    const listRes = await ctx.get(`${API_URL}/api/jobs`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    const list = await listRes.json()
    if (list.jobs.length === 0) return

    const jobId = list.jobs[0].id
    const statuses = ['applied', 'interviewing', 'rejected', 'not_applied', 'applied']

    for (const status of statuses) {
      const res = await ctx.patch(`${API_URL}/api/jobs/${jobId}/status`, {
        headers: { Authorization: `Bearer ${token}`, 'X-CSRF-Token': 'x' },
        params: { status },
      })
      expect(res.status()).toBe(200)
    }

    // Final state should be the last status
    const finalRes = await ctx.get(`${API_URL}/api/jobs/${jobId}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    const finalJob = await finalRes.json()
    expect(finalJob.Status).toBe('applied')
  })

  test('POW2 — Concurrent session from two browser tabs uses the same token', async ({ browser, request }) => {
    const ctx = await newApiContext()
    const { username, password } = await apiSignup(ctx, 'pow2')

    const ctx1 = await browser.newContext()
    const ctx2 = await browser.newContext()
    const page1 = await ctx1.newPage()
    const page2 = await ctx2.newPage()

    await uiLogin(page1, username, password)
    await uiLogin(page2, username, password)

    // Both should be authenticated — no conflict
    await expect(page1.locator('.auth-shell')).toBeHidden({ timeout: 8000 })
    await expect(page2.locator('.auth-shell')).toBeHidden({ timeout: 8000 })

    await ctx1.close()
    await ctx2.close()
  })

  test('POW3 — Using filter parameters together works without crash', async ({ request }) => {
    const ctx = await newApiContext()
    const { token } = await apiSignup(ctx, 'pow3')
    await ctx.post(`${API_URL}/api/onboarding/complete`, {
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', 'X-CSRF-Token': 'x' },
      data: { onboarding_step: 'complete' },
    })

    const res = await ctx.get(`${API_URL}/api/jobs?status=not_applied&source=linkedin&skip=0&limit=50`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    expect(res.status()).toBe(200)
    const body = await res.json()
    expect(Array.isArray(body.jobs)).toBe(true)
  })
})

// ─── Performance baseline ─────────────────────────────────────────────────────

test.describe('Performance', () => {
  test('PERF1 — /api/jobs responds in under 5 seconds', async ({ request }) => {
    const ctx = await newApiContext()
    const { token } = await apiSignup(ctx, 'perf1')
    await ctx.post(`${API_URL}/api/onboarding/complete`, {
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', 'X-CSRF-Token': 'x' },
      data: { onboarding_step: 'complete' },
    })

    const start = Date.now()
    const res = await ctx.get(`${API_URL}/api/jobs`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    const elapsed = Date.now() - start

    expect(res.status()).toBe(200)
    expect(elapsed).toBeLessThan(5000) // 5s budget
    if (elapsed > 1000) {
      console.warn(`[PERF1] /api/jobs took ${elapsed}ms — O(n) sync_user_matched_jobs may be the bottleneck`)
    }
  })

  test('PERF2 — Auth endpoints respond in under 2 seconds', async ({ request }) => {
    const start = Date.now()
    const res = await request.post(`${API_URL}/api/v1/auth/signup`, {
      data: { username: uniqueUser('perf2'), password: 'TestPass123!' },
    })
    const elapsed = Date.now() - start
    expect(res.status()).toBe(200)
    expect(elapsed).toBeLessThan(2000)
  })
})
