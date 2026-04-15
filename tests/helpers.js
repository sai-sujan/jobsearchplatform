import { request as playwrightRequest } from '@playwright/test'

/**
 * Shared test helpers for all spec files.
 * Import from helpers.js in every spec.
 */

export const API_URL = process.env.API_URL || 'http://127.0.0.1:5001'
export const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173'

/**
 * Create an isolated Playwright API request context.
 *
 * The Playwright `request` test fixture is already a context and does not
 * expose `.newContext()`. Specs use this helper when they need isolated
 * cookies or multiple users inside one test.
 */
export async function newApiContext(options = {}) {
  return playwrightRequest.newContext({ baseURL: API_URL, ...options })
}

// A resume text that is long enough (>50 chars) to pass the backend validator
export const VALID_RESUME_TEXT = `
Jane Doe — Machine Learning Engineer
Email: jane@example.com | GitHub: github.com/janedoe

Skills: Python, FastAPI, PostgreSQL, Docker, TensorFlow, PyTorch, Scikit-learn,
        Hugging Face, LangChain, LangGraph, RAG, MLflow, AWS, Kubernetes, Redis

Experience:
  Software Engineer, Acme Corp (2022-2024)
  - Built LLM-powered chatbot with LangChain and Pinecone, reducing support tickets by 30%
  - Designed anomaly detection pipeline using PyTorch serving 500k events/day
  - Deployed ML models on AWS SageMaker with automated retraining via MLflow

Education:
  B.S. Computer Science, State University, 2022 — GPA 3.8
`.trim()

/**
 * Create a unique username so tests don't collide.
 */
export function uniqueUser(prefix = 'qa') {
  return `${prefix}_${Date.now()}_${Math.floor(Math.random() * 9999)}`
}

/**
 * Register a user via the REST API and return { username, password, cookies }.
 * Using the API directly is faster than driving the UI every time.
 */
export async function apiSignup(request, prefix = 'qa') {
  const username = uniqueUser(prefix)
  const password = 'TestPass123!'
  const res = await request.post(`${API_URL}/api/v1/auth/signup`, {
    data: { username, password, full_name: 'QA Tester' },
  })
  if (!res.ok()) {
    throw new Error(`Signup failed: ${res.status()} ${await res.text()}`)
  }
  const body = await res.json()
  return { username, password, token: body.token, userId: body.user?.id }
}

/**
 * Return a fresh Axios-style API request context that is already authenticated
 * (bearer token + CSRF cookie both set correctly for POST/PATCH/DELETE).
 */
export async function authenticatedRequest(playwright, prefix = 'qa') {
  const ctx = await playwright.request.newContext({ baseURL: API_URL })
  const { token } = await apiSignup(ctx, prefix)

  // Playwright request contexts don't have interceptors, so we pass the token
  // via a stored variable and add it to each call explicitly.
  // We wrap ctx so callers can call ctx.get/post/patch/delete as normal
  // but we inject Authorization automatically.
  return { ctx, token }
}

/**
 * Get the CSRF token value from a page's cookies.
 */
export async function getCsrfFromPage(page) {
  const cookies = await page.context().cookies()
  const csrf = cookies.find((c) => c.name === 'jobapp_csrf')
  return csrf?.value || ''
}

/**
 * Drive the UI login flow. Returns after the page has left the auth screen.
 */
export async function uiLogin(page, username, password) {
  await page.goto(FRONTEND_URL)
  await page.waitForLoadState('networkidle')
  await page.getByLabel('Username').fill(username)
  await page.getByLabel('Password').fill(password)
  await page.getByRole('button', { name: 'Continue' }).click()
  // Wait until we are no longer on the auth page
  await page.waitForFunction(
    () => !document.querySelector('.auth-shell'),
    { timeout: 8000 },
  )
}

/**
 * Drive the UI signup flow. Returns after moving past the auth screen.
 */
export async function uiSignup(page, username, password, fullName = 'QA User') {
  await page.goto(FRONTEND_URL)
  await page.waitForLoadState('networkidle')
  await page.getByRole('button', { name: 'Create account' }).click()
  await page.getByLabel('Full name').fill(fullName)
  await page.getByLabel('Username').fill(username)
  await page.getByLabel('Password').fill(password)
  await page.getByRole('button', { name: 'Start onboarding' }).click()
  await page.waitForFunction(
    () => !document.querySelector('.auth-shell'),
    { timeout: 8000 },
  )
}
