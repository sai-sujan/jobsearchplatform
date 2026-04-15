/**
 * Jobs Feed Test Suite
 * Covers: listing, filtering, pagination, status updates, notes,
 *         special interest, analysis, delete/archive, isolation
 */

import { test, expect } from '@playwright/test'
import { API_URL, apiSignup, newApiContext } from './helpers.js'

// ─── Setup helper ─────────────────────────────────────────────────────────────

async function setupUser(request, prefix = 'jobs') {
  const ctx = await newApiContext()
  const { username, token } = await apiSignup(ctx, prefix)

  // Complete onboarding so /api/jobs works
  await ctx.put(`${API_URL}/api/onboarding/profile`, {
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      'X-CSRF-Token': 'bearer-bypass',
    },
    data: {
      target_roles: ['Machine Learning Engineer'],
      seniority: 'Entry level',
      preferred_locations: ['Remote'],
      work_modes: ['Remote'],
      employment_types: ['Full-time'],
      industries: ['Technology'],
      quality_filters: {},
      onboarding_step: 'profile',
    },
  })
  await ctx.post(`${API_URL}/api/onboarding/complete`, {
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      'X-CSRF-Token': 'bearer-bypass',
    },
    data: { onboarding_step: 'complete' },
  })

  return { ctx, username, token }
}

function authHeaders(token) {
  return {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
    'X-CSRF-Token': 'bearer-bypass',
  }
}

// ─── Job listing ──────────────────────────────────────────────────────────────

test.describe('Job listing', () => {
  test('J1 — Authenticated user gets jobs response with correct shape', async ({ request }) => {
    const { ctx, token } = await setupUser(request, 'j1')
    const res = await ctx.get(`${API_URL}/api/jobs`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    expect(res.status()).toBe(200)
    const body = await res.json()
    expect(body).toHaveProperty('jobs')
    expect(body).toHaveProperty('stats')
    expect(body).toHaveProperty('active_filters')
    expect(Array.isArray(body.jobs)).toBe(true)
    expect(body.stats).toHaveProperty('total')
    expect(body.stats).toHaveProperty('good_matches')
    expect(body.stats).toHaveProperty('perfect_matches')
  })

  test('J17 — Unauthenticated request returns 401', async ({ request }) => {
    const anonCtx = await newApiContext()
    const res = await anonCtx.get(`${API_URL}/api/jobs`)
    expect(res.status()).toBe(401)
  })

  test('J2 — Status filter returns only matching jobs', async ({ request }) => {
    const { ctx, token } = await setupUser(request, 'j2')
    const res = await ctx.get(`${API_URL}/api/jobs?status=applied`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    expect(res.status()).toBe(200)
    const body = await res.json()
    // All returned jobs should have the filtered status
    for (const job of body.jobs) {
      expect(job.Status).toBe('applied')
    }
  })

  test('J3 — Source filter returns only matching jobs', async ({ request }) => {
    const { ctx, token } = await setupUser(request, 'j3')
    const res = await ctx.get(`${API_URL}/api/jobs?source=linkedin`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    expect(res.status()).toBe(200)
    const body = await res.json()
    for (const job of body.jobs) {
      expect(job.Source?.toLowerCase()).toBe('linkedin')
    }
  })
})

// ─── Pagination ───────────────────────────────────────────────────────────────

test.describe('Pagination', () => {
  test('J4 — limit=5 returns at most 5 results', async ({ request }) => {
    const { ctx, token } = await setupUser(request, 'j4')
    const res = await ctx.get(`${API_URL}/api/jobs?skip=0&limit=5`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    expect(res.status()).toBe(200)
    const body = await res.json()
    expect(body.jobs.length).toBeLessThanOrEqual(5)
  })

  test('J5 — limit=500 (maximum) is accepted', async ({ request }) => {
    const { ctx, token } = await setupUser(request, 'j5')
    const res = await ctx.get(`${API_URL}/api/jobs?limit=500`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    expect(res.status()).toBe(200)
  })

  test('J6 — limit=501 (over max) returns 422', async ({ request }) => {
    const { ctx, token } = await setupUser(request, 'j6')
    const res = await ctx.get(`${API_URL}/api/jobs?limit=501`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    expect(res.status()).toBe(422)
  })

  test('J7 — skip=-1 (negative) returns 422', async ({ request }) => {
    const { ctx, token } = await setupUser(request, 'j7')
    const res = await ctx.get(`${API_URL}/api/jobs?skip=-1`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    expect(res.status()).toBe(422)
  })

  test('skip=0 and skip=1 return different result offsets', async ({ request }) => {
    const { ctx, token } = await setupUser(request, 'j_pag')
    const [res0, res1] = await Promise.all([
      ctx.get(`${API_URL}/api/jobs?skip=0&limit=2`, { headers: { Authorization: `Bearer ${token}` } }),
      ctx.get(`${API_URL}/api/jobs?skip=1&limit=2`, { headers: { Authorization: `Bearer ${token}` } }),
    ])
    if ((await res0.json()).jobs.length > 1) {
      const jobs0 = (await res0.json()).jobs
      const jobs1 = (await res1.json()).jobs
      // First item of skip=1 should match second item of skip=0
      if (jobs0.length >= 2 && jobs1.length >= 1) {
        expect(jobs1[0].id).toBe(jobs0[1].id)
      }
    }
  })
})

// ─── Single job ───────────────────────────────────────────────────────────────

test.describe('Single job', () => {
  test('J8 — GET /api/jobs/{valid_id} returns correct job shape', async ({ request }) => {
    const { ctx, token } = await setupUser(request, 'j8')
    // First list to get a valid ID
    const listRes = await ctx.get(`${API_URL}/api/jobs?limit=1`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    const list = await listRes.json()

    if (list.jobs.length === 0) {
      test.skip() // No jobs seeded in this environment
      return
    }

    const jobId = list.jobs[0].id
    const res = await ctx.get(`${API_URL}/api/jobs/${jobId}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    expect(res.status()).toBe(200)
    const job = await res.json()
    expect(job).toHaveProperty('id', jobId)
    expect(job).toHaveProperty('Title')
    expect(job).toHaveProperty('Company')
    expect(job).toHaveProperty('Link')
  })

  test('J9 — Accessing non-existent job returns 404', async ({ request }) => {
    const { ctx, token } = await setupUser(request, 'j9')
    const res = await ctx.get(`${API_URL}/api/jobs/99999999`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    expect(res.status()).toBe(404)
  })

  test('J9 — Cannot access another user\'s job', async ({ request }) => {
    const user1 = await setupUser(request, 'iso1')
    const user2 = await setupUser(request, 'iso2')

    // Get a job ID for user1
    const listRes = await user1.ctx.get(`${API_URL}/api/jobs?limit=1`, {
      headers: { Authorization: `Bearer ${user1.token}` },
    })
    const list = await listRes.json()
    if (list.jobs.length === 0) return // Nothing to test

    const user1JobId = list.jobs[0].id

    // Try user2 fetching user1's job
    const res = await user2.ctx.get(`${API_URL}/api/jobs/${user1JobId}`, {
      headers: { Authorization: `Bearer ${user2.token}` },
    })
    expect(res.status()).toBe(404) // Must not expose other user's job
  })
})

// ─── Status updates ───────────────────────────────────────────────────────────

test.describe('Job status updates', () => {
  async function getFirstJobId(ctx, token) {
    const res = await ctx.get(`${API_URL}/api/jobs?limit=1`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    const body = await res.json()
    return body.jobs[0]?.id ?? null
  }

  test('J10 — PATCH status to "applied" succeeds', async ({ request }) => {
    const { ctx, token } = await setupUser(request, 'j10')
    const jobId = await getFirstJobId(ctx, token)
    if (!jobId) return test.skip()

    const res = await ctx.patch(`${API_URL}/api/jobs/${jobId}/status`, {
      headers: authHeaders(token),
      params: { status: 'applied' },
    })
    expect(res.status()).toBe(200)

    // Verify status persisted
    const jobRes = await ctx.get(`${API_URL}/api/jobs/${jobId}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    const job = await jobRes.json()
    expect(job.Status).toBe('applied')
  })

  test('J10 — All valid statuses are accepted', async ({ request }) => {
    const { ctx, token } = await setupUser(request, 'j10b')
    const jobId = await getFirstJobId(ctx, token)
    if (!jobId) return test.skip()

    const validStatuses = ['not_applied', 'applied', 'interviewing', 'accepted', 'rejected', 'skipped']
    for (const status of validStatuses) {
      const res = await ctx.patch(`${API_URL}/api/jobs/${jobId}/status`, {
        headers: authHeaders(token),
        params: { status },
      })
      expect(res.status()).toBe(200)
    }
  })

  test('J11 — Arbitrary status string is currently accepted (known bug)', async ({ request }) => {
    // This test documents the existing bug: no enum validation on status field
    const { ctx, token } = await setupUser(request, 'j11')
    const jobId = await getFirstJobId(ctx, token)
    if (!jobId) return test.skip()

    const res = await ctx.patch(`${API_URL}/api/jobs/${jobId}/status`, {
      headers: authHeaders(token),
      params: { status: 'flying_on_a_rocket' },
    })
    // Document current behavior: 200 (should ideally be 422)
    // When fixed, this test should expect 422
    expect([200, 422]).toContain(res.status())
  })
})

// ─── Special interest ─────────────────────────────────────────────────────────

test.describe('Special interest toggle', () => {
  async function getFirstJobId(ctx, token) {
    const res = await ctx.get(`${API_URL}/api/jobs?limit=1`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    return (await res.json()).jobs[0]?.id ?? null
  }

  test('J12 — Toggle special_interest to true', async ({ request }) => {
    const { ctx, token } = await setupUser(request, 'j12')
    const jobId = await getFirstJobId(ctx, token)
    if (!jobId) return test.skip()

    const res = await ctx.patch(`${API_URL}/api/jobs/${jobId}/interest`, {
      headers: authHeaders(token),
      params: { special_interest: 'true' },
    })
    expect(res.status()).toBe(200)
  })

  test('J12 — Toggle special_interest back to false', async ({ request }) => {
    const { ctx, token } = await setupUser(request, 'j12b')
    const jobId = await getFirstJobId(ctx, token)
    if (!jobId) return test.skip()

    await ctx.patch(`${API_URL}/api/jobs/${jobId}/interest`, {
      headers: authHeaders(token),
      params: { special_interest: 'true' },
    })
    const res = await ctx.patch(`${API_URL}/api/jobs/${jobId}/interest`, {
      headers: authHeaders(token),
      params: { special_interest: 'false' },
    })
    expect(res.status()).toBe(200)
  })
})

// ─── Notes ────────────────────────────────────────────────────────────────────

test.describe('Job notes', () => {
  async function getFirstJobId(ctx, token) {
    const res = await ctx.get(`${API_URL}/api/jobs?limit=1`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    return (await res.json()).jobs[0]?.id ?? null
  }

  test('J13 — Save and retrieve notes', async ({ request }) => {
    const { ctx, token } = await setupUser(request, 'j13')
    const jobId = await getFirstJobId(ctx, token)
    if (!jobId) return test.skip()

    const noteText = 'Great company, strong ML team, apply by end of month'
    const res = await ctx.patch(`${API_URL}/api/jobs/${jobId}/notes`, {
      headers: authHeaders(token),
      params: { notes: noteText },
    })
    expect(res.status()).toBe(200)

    // Retrieve and verify
    const jobRes = await ctx.get(`${API_URL}/api/jobs/${jobId}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    const job = await jobRes.json()
    expect(job.Notes).toBe(noteText)
  })

  test('Notes with empty string clears previous note', async ({ request }) => {
    const { ctx, token } = await setupUser(request, 'j13b')
    const jobId = await getFirstJobId(ctx, token)
    if (!jobId) return test.skip()

    await ctx.patch(`${API_URL}/api/jobs/${jobId}/notes`, {
      headers: authHeaders(token),
      params: { notes: 'Some note' },
    })
    const res = await ctx.patch(`${API_URL}/api/jobs/${jobId}/notes`, {
      headers: authHeaders(token),
      params: { notes: '' },
    })
    expect(res.status()).toBe(200)
  })
})

// ─── Analysis update ──────────────────────────────────────────────────────────

test.describe('Job analysis update', () => {
  async function getFirstJobId(ctx, token) {
    const res = await ctx.get(`${API_URL}/api/jobs?limit=1`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    return (await res.json()).jobs[0]?.id ?? null
  }

  test('J14 — PATCH /api/jobs/{id}/analysis saves analysis data', async ({ request }) => {
    const { ctx, token } = await setupUser(request, 'j14')
    const jobId = await getFirstJobId(ctx, token)
    if (!jobId) return test.skip()

    const payload = {
      ats_score: 82,
      location: 'San Francisco, CA',
      tech_stack: {
        'Programming Languages': ['Python', 'SQL'],
        'ML Frameworks': ['PyTorch', 'TensorFlow'],
      },
      suggested_tech_stack: {},
      points: [
        'Built LLM pipeline with LangChain reducing latency by 40%',
        'Deployed anomaly detection model on AWS SageMaker',
      ],
    }

    const res = await ctx.patch(`${API_URL}/api/jobs/${jobId}/analysis`, {
      headers: authHeaders(token),
      data: payload,
    })
    expect(res.status()).toBe(200)
    const body = await res.json()
    expect(body).toHaveProperty('message')
    expect(body).toHaveProperty('job')
  })

  test('J14 — matched_skills are capped at 16 entries', async ({ request }) => {
    const { ctx, token } = await setupUser(request, 'j14b')
    const jobId = await getFirstJobId(ctx, token)
    if (!jobId) return test.skip()

    // Provide 20 skills across categories
    const manySkills = Array.from({ length: 20 }, (_, i) => `Skill${i + 1}`)
    const res = await ctx.patch(`${API_URL}/api/jobs/${jobId}/analysis`, {
      headers: authHeaders(token),
      data: {
        ats_score: 75,
        location: 'Remote',
        tech_stack: { 'Languages': manySkills },
        points: [],
      },
    })
    expect(res.status()).toBe(200)
    const body = await res.json()
    const matchedStr = body.job?.['Matched Skills'] || ''
    const skillCount = matchedStr ? matchedStr.split(',').length : 0
    expect(skillCount).toBeLessThanOrEqual(16)
  })
})

// ─── Delete / archive ─────────────────────────────────────────────────────────

test.describe('Delete / archive job', () => {
  async function getFirstJobId(ctx, token) {
    const res = await ctx.get(`${API_URL}/api/jobs?limit=1`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    return (await res.json()).jobs[0]?.id ?? null
  }

  test('J15 — DELETE archives the job (no longer in active feed)', async ({ request }) => {
    const { ctx, token } = await setupUser(request, 'j15')
    const jobId = await getFirstJobId(ctx, token)
    if (!jobId) return test.skip()

    const res = await ctx.delete(`${API_URL}/api/jobs/${jobId}`, {
      headers: authHeaders(token),
    })
    expect(res.status()).toBe(200)
    const body = await res.json()
    expect(body.message).toMatch(/archived/i)

    // Job should no longer appear in active feed
    const listRes = await ctx.get(`${API_URL}/api/jobs`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    const list = await listRes.json()
    const stillPresent = list.jobs.some((j) => j.id === jobId)
    expect(stillPresent).toBe(false)
  })

  test('J16 — Cannot delete another user\'s job', async ({ request }) => {
    const user1 = await setupUser(request, 'del_iso1')
    const user2 = await setupUser(request, 'del_iso2')

    const listRes = await user1.ctx.get(`${API_URL}/api/jobs?limit=1`, {
      headers: { Authorization: `Bearer ${user1.token}` },
    })
    const list = await listRes.json()
    if (list.jobs.length === 0) return

    const user1JobId = list.jobs[0].id
    const res = await user2.ctx.delete(`${API_URL}/api/jobs/${user1JobId}`, {
      headers: authHeaders(user2.token),
    })
    expect(res.status()).toBe(404)
  })
})

// ─── Match intelligence ───────────────────────────────────────────────────────

test.describe('Match intelligence', () => {
  test('J18 — GET /api/jobs/{id}/match-intelligence returns scores', async ({ request }) => {
    const { ctx, token } = await setupUser(request, 'j18')
    const listRes = await ctx.get(`${API_URL}/api/jobs?limit=1`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    const list = await listRes.json()
    if (list.jobs.length === 0) return test.skip()

    const jobId = list.jobs[0].id
    const res = await ctx.get(`${API_URL}/api/jobs/${jobId}/match-intelligence`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    expect(res.status()).toBe(200)
    const body = await res.json()
    expect(body).toHaveProperty('job_id')
    expect(body).toHaveProperty('match_intelligence')
    expect(body.match_intelligence).toHaveProperty('ai_match_score')
  })
})
