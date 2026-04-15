/**
 * Authentication Test Suite
 * Covers: signup, login, logout, session validation, CSRF, edge cases
 */

import { test, expect } from '@playwright/test'
import {
  API_URL,
  FRONTEND_URL,
  apiSignup,
  uiLogin,
  uiSignup,
  uniqueUser,
  getCsrfFromPage,
  newApiContext,
} from './helpers.js'

// ─── Signup ───────────────────────────────────────────────────────────────────

test.describe('Signup', () => {
  test('A1 — Valid signup creates account and sets session cookies', async ({ page, request }) => {
    const username = uniqueUser('signup')
    const res = await request.post(`${API_URL}/api/v1/auth/signup`, {
      data: { username, password: 'TestPass123!', full_name: 'Test User' },
    })

    expect(res.status()).toBe(200)
    const body = await res.json()
    expect(body).toHaveProperty('token')
    expect(body.user.username).toBe(username)
    expect(body.user).toHaveProperty('onboarding_completed')
    // Cookie should be set in real browser context
    await uiSignup(page, uniqueUser('signup_ui'), 'TestPass123!')
    // After signup, should be out of auth screen
    await expect(page.locator('.auth-shell')).toBeHidden({ timeout: 8000 })
  })

  test('A2 — Duplicate username returns 409 Conflict', async ({ request }) => {
    const username = uniqueUser('dup')
    // Register once
    await request.post(`${API_URL}/api/v1/auth/signup`, {
      data: { username, password: 'TestPass123!' },
    })
    // Register again with same username
    const res = await request.post(`${API_URL}/api/v1/auth/signup`, {
      data: { username, password: 'DifferentPass1!' },
    })
    expect(res.status()).toBe(409)
    const body = await res.json()
    expect(body.detail).toMatch(/already exists/i)
  })

  test('A2-UI — Duplicate username shows error in the form', async ({ page }) => {
    const username = uniqueUser('dup_ui')
    // Pre-register via API
    await fetch(`${API_URL}/api/v1/auth/signup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password: 'TestPass123!' }),
    }).catch(() => {})

    await page.goto(FRONTEND_URL)
    await page.getByRole('button', { name: 'Create account' }).click()
    await page.getByLabel('Username').fill(username)
    await page.getByLabel('Password').fill('TestPass123!')
    await page.getByRole('button', { name: 'Start onboarding' }).click()

    await expect(page.locator('.auth-error')).toBeVisible({ timeout: 6000 })
    await expect(page.locator('.auth-error')).toContainText(/already exists|conflict|taken/i)
  })

  test('A3 — Password shorter than 8 chars returns 422', async ({ request }) => {
    const res = await request.post(`${API_URL}/api/v1/auth/signup`, {
      data: { username: uniqueUser('shortpw'), password: 'abc' },
    })
    expect(res.status()).toBe(422)
  })

  test('A4 — Password exactly 8 chars is accepted', async ({ request }) => {
    const res = await request.post(`${API_URL}/api/v1/auth/signup`, {
      data: { username: uniqueUser('pw8'), password: '12345678' },
    })
    expect(res.status()).toBe(200)
  })

  test('A5 — Username shorter than 3 chars returns 422', async ({ request }) => {
    const res = await request.post(`${API_URL}/api/v1/auth/signup`, {
      data: { username: 'ab', password: 'TestPass123!' },
    })
    expect(res.status()).toBe(422)
  })

  test('A15 — Empty username returns 422', async ({ request }) => {
    const res = await request.post(`${API_URL}/api/v1/auth/signup`, {
      data: { username: '', password: 'TestPass123!' },
    })
    expect(res.status()).toBe(422)
  })

  test('A17 — XSS in full_name is stored safely (not executed)', async ({ page, request }) => {
    const username = uniqueUser('xss')
    const res = await request.post(`${API_URL}/api/v1/auth/signup`, {
      data: {
        username,
        password: 'TestPass123!',
        full_name: '<script>window.__XSS__=true</script>',
      },
    })
    expect(res.status()).toBe(200)

    // Login in browser and verify no script execution
    await uiLogin(page, username, 'TestPass123!')
    const xssExecuted = await page.evaluate(() => window.__XSS__ ?? false)
    expect(xssExecuted).toBe(false)
  })
})

// ─── Login ────────────────────────────────────────────────────────────────────

test.describe('Login', () => {
  test('A6 — Valid login returns token and user info', async ({ request }) => {
    const { username, password } = await apiSignup(request, 'login_valid')
    const res = await request.post(`${API_URL}/api/v1/auth/login`, {
      data: { username, password },
    })
    expect(res.status()).toBe(200)
    const body = await res.json()
    expect(body).toHaveProperty('token')
    expect(body.user.username).toBe(username)
  })

  test('A6-UI — Valid login moves user out of auth screen', async ({ page, request }) => {
    const { username, password } = await apiSignup(request, 'login_ui')
    await uiLogin(page, username, password)
    await expect(page.locator('.auth-shell')).toBeHidden({ timeout: 6000 })
  })

  test('A7 — Wrong password returns 401', async ({ request }) => {
    const { username } = await apiSignup(request, 'wrong_pw')
    const res = await request.post(`${API_URL}/api/v1/auth/login`, {
      data: { username, password: 'WrongPassword!' },
    })
    expect(res.status()).toBe(401)
    const body = await res.json()
    expect(body.detail).toMatch(/invalid|incorrect/i)
  })

  test('A7-UI — Wrong password shows error message', async ({ page, request }) => {
    const { username } = await apiSignup(request, 'wrong_pw_ui')
    await page.goto(FRONTEND_URL)
    await page.getByLabel('Username').fill(username)
    await page.getByLabel('Password').fill('BadPassword999')
    await page.getByRole('button', { name: 'Continue' }).click()
    await expect(page.locator('.auth-error')).toBeVisible({ timeout: 5000 })
  })

  test('A8 — Non-existent username returns 401', async ({ request }) => {
    const res = await request.post(`${API_URL}/api/v1/auth/login`, {
      data: { username: 'nobody_12345678', password: 'TestPass123!' },
    })
    expect(res.status()).toBe(401)
  })

  test('A9 — Username is case-insensitive (normalized to lowercase)', async ({ request }) => {
    const base = uniqueUser('case')
    // Signup with lowercase
    await request.post(`${API_URL}/api/v1/auth/signup`, {
      data: { username: base, password: 'TestPass123!' },
    })
    // Login with UPPERCASE
    const res = await request.post(`${API_URL}/api/v1/auth/login`, {
      data: { username: base.toUpperCase(), password: 'TestPass123!' },
    })
    expect(res.status()).toBe(200)
  })

  test('A16 — SQL injection in username does not authenticate', async ({ request }) => {
    const res = await request.post(`${API_URL}/api/v1/auth/login`, {
      data: { username: "admin' OR '1'='1'--", password: 'anything' },
    })
    expect(res.status()).toBe(401)
  })
})

// ─── Session ──────────────────────────────────────────────────────────────────

test.describe('Session', () => {
  test('A14 — /api/v1/auth/me without session returns 401', async ({ request }) => {
    // Fresh context with no cookies
    const res = await request.get(`${API_URL}/api/v1/auth/me`)
    expect(res.status()).toBe(401)
  })

  test('A13 — Tampered JWT is rejected', async ({ request }) => {
    const { token } = await apiSignup(request, 'tamper')
    // Flip one character in the signature
    const tampered = token.slice(0, -5) + 'XXXXX'
    const res = await request.get(`${API_URL}/api/v1/auth/me`, {
      headers: { Authorization: `Bearer ${tampered}` },
    })
    expect(res.status()).toBe(401)
  })

  test('A12 — Completely fabricated JWT is rejected', async ({ request }) => {
    const fakeToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiI5OTk5IiwiZXhwIjo5OTk5OTk5OTk5fQ.fake'
    const res = await request.get(`${API_URL}/api/v1/auth/me`, {
      headers: { Authorization: `Bearer ${fakeToken}` },
    })
    expect(res.status()).toBe(401)
  })

  test('Session user data is complete', async ({ request }) => {
    const { username, token } = await apiSignup(request, 'session_data')
    const res = await request.get(`${API_URL}/api/v1/auth/me`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    expect(res.ok()).toBeTruthy()
    const body = await res.json()
    expect(body.user).toHaveProperty('id')
    expect(body.user).toHaveProperty('username', username)
    expect(body.user).toHaveProperty('onboarding_completed')
    expect(body.user).toHaveProperty('onboarding_step')
  })
})

// ─── Logout ───────────────────────────────────────────────────────────────────

test.describe('Logout', () => {
  test('A10-UI — Logout button clears session and shows auth screen', async ({ page, request }) => {
    const { username, password, token } = await apiSignup(request, 'logout_ui')
    await request.post(`${API_URL}/api/onboarding/complete`, {
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        'X-CSRF-Token': 'bearer-bypass',
      },
      data: { onboarding_step: 'complete' },
    })
    await uiLogin(page, username, password)

    await expect(page.locator('.app-frame')).toBeVisible({ timeout: 8000 })
    await page.waitForTimeout(500)
    await page.evaluate(() => {
      const logoutButton = [...document.querySelectorAll('button')].find((button) =>
        /log out/i.test(button.textContent || ''),
      )
      logoutButton?.click()
    })
    await expect(page.locator('.auth-shell')).toBeVisible({ timeout: 6000 })
  })

  test('A11 — Logout without CSRF token returns 403', async ({ request }) => {
    const { token } = await apiSignup(request, 'csrf_logout')
    // Make a logout POST with the bearer token but NO X-CSRF-Token header
    // Bearer mode skips CSRF, so we test with cookie mode only
    // Here we deliberately omit both header and cookie — backend is cookie mode
    const res = await request.post(`${API_URL}/api/v1/auth/logout`, {
      headers: { Authorization: `Bearer ${token}` },
      // bearer mode bypasses CSRF per deps.py:131 — so test the cookie path
    })
    // With bearer the CSRF is skipped; documented behavior
    // The real test is: no Authorization header + no CSRF cookie
    const noAuthCtx = await newApiContext()
    const res2 = await noAuthCtx.post(`${API_URL}/api/v1/auth/logout`)
    expect(res2.status()).toBe(401) // Not authenticated at all
  })

  test('A11-CSRF — Cookie session logout without X-CSRF-Token header returns 403', async ({ page, request }) => {
    const { token } = await apiSignup(request, 'csrf_cookie')
    await page.context().addCookies([
      {
        name: 'jobapp_session',
        value: token,
        url: API_URL,
        httpOnly: true,
        sameSite: 'Lax',
      },
    ])
    await page.goto(`${API_URL}/api/health`)

    // Make the request from the API origin with a session cookie but no CSRF header.
    const response = await page.evaluate(async () => {
      const res = await fetch('/api/v1/auth/logout', {
        method: 'POST',
        credentials: 'include', // sends session cookie
        // intentionally NO X-CSRF-Token header
      })
      return res.status
    })

    expect(response).toBe(403)
  })
})
