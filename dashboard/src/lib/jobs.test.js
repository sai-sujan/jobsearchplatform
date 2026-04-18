import { describe, it, expect, vi, afterEach } from 'vitest'
import {
  APPLIED_STATUSES,
  getJobId,
  normalizeStatus,
  isJobFromToday,
  formatDisplayDate,
  formatCompactDate,
  formatDisplayDateTime,
  getTierVariant,
  getSourceLabel,
  getDisplayMatchScore,
  getMatchedSkills,
} from './jobs'

// ---------------------------------------------------------------------------
// getJobId
// ---------------------------------------------------------------------------
describe('getJobId', () => {
  it('returns job_id when present', () => {
    expect(getJobId({ job_id: 'match_42' })).toBe('match_42')
  })

  it('falls back to row-{_rowIndex} when no job_id', () => {
    expect(getJobId({ _rowIndex: 7 })).toBe('row-7')
  })

  it('returns row-unknown for empty object', () => {
    expect(getJobId({})).toBe('row-unknown')
  })

  it('returns row-unknown for null/undefined', () => {
    expect(getJobId(null)).toBe('row-unknown')
    expect(getJobId(undefined)).toBe('row-unknown')
  })
})

// ---------------------------------------------------------------------------
// normalizeStatus
// ---------------------------------------------------------------------------
describe('normalizeStatus', () => {
  it('lowercases the status', () => {
    expect(normalizeStatus('Applied')).toBe('applied')
    expect(normalizeStatus('INTERVIEWING')).toBe('interviewing')
  })

  it('defaults to not_applied when falsy', () => {
    expect(normalizeStatus('')).toBe('not_applied')
    expect(normalizeStatus(null)).toBe('not_applied')
    expect(normalizeStatus(undefined)).toBe('not_applied')
  })
})

// ---------------------------------------------------------------------------
// APPLIED_STATUSES
// ---------------------------------------------------------------------------
describe('APPLIED_STATUSES', () => {
  it('contains applied, interviewing, accepted', () => {
    expect(APPLIED_STATUSES).toContain('applied')
    expect(APPLIED_STATUSES).toContain('interviewing')
    expect(APPLIED_STATUSES).toContain('accepted')
  })

  it('does not contain not_applied or skipped', () => {
    expect(APPLIED_STATUSES).not.toContain('not_applied')
    expect(APPLIED_STATUSES).not.toContain('skipped')
  })
})

// ---------------------------------------------------------------------------
// isJobFromToday
// ---------------------------------------------------------------------------
describe('isJobFromToday', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('returns true for a date that is today', () => {
    const now = new Date()
    const job = { 'Date Found': now.toISOString() }
    expect(isJobFromToday(job)).toBe(true)
  })

  it('returns false for a date that is yesterday', () => {
    const yesterday = new Date()
    yesterday.setDate(yesterday.getDate() - 1)
    const job = { 'Date Found': yesterday.toISOString() }
    expect(isJobFromToday(job)).toBe(false)
  })

  it('returns false when Date Found is missing', () => {
    expect(isJobFromToday({})).toBe(false)
    expect(isJobFromToday(null)).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// formatDisplayDate
// Use a noon local time to avoid date shifting across timezones
// ---------------------------------------------------------------------------
describe('formatDisplayDate', () => {
  it('returns a readable date string for a valid date', () => {
    // Construct date in local time to avoid timezone shift
    const d = new Date(2025, 5, 15, 12, 0, 0) // June 15 2025 noon local
    const result = formatDisplayDate(d.toISOString())
    expect(result).toMatch(/Jun/)
    expect(result).toMatch(/15/)
    expect(result).toMatch(/2025/)
  })

  it('returns "Unknown date" for null/undefined/empty', () => {
    expect(formatDisplayDate(null)).toBe('Unknown date')
    expect(formatDisplayDate(undefined)).toBe('Unknown date')
    expect(formatDisplayDate('')).toBe('Unknown date')
  })
})

// ---------------------------------------------------------------------------
// formatCompactDate
// ---------------------------------------------------------------------------
describe('formatCompactDate', () => {
  it('returns a short month/day for a valid date', () => {
    const d = new Date(2025, 5, 15, 12, 0, 0) // June 15 noon local
    const result = formatCompactDate(d.toISOString())
    expect(result).toMatch(/6/)
    expect(result).toMatch(/15/)
  })

  it('returns "Recently added" for falsy input', () => {
    expect(formatCompactDate(null)).toBe('Recently added')
    expect(formatCompactDate('')).toBe('Recently added')
  })
})

// ---------------------------------------------------------------------------
// formatDisplayDateTime
// ---------------------------------------------------------------------------
describe('formatDisplayDateTime', () => {
  it('returns a date string that includes month and day', () => {
    const d = new Date(2025, 5, 15, 12, 0, 0) // June 15 noon local
    const result = formatDisplayDateTime(d.toISOString())
    expect(result).toMatch(/Jun/)
    expect(result).toMatch(/15/)
  })

  it('returns "Unknown" for falsy input', () => {
    expect(formatDisplayDateTime(null)).toBe('Unknown')
    expect(formatDisplayDateTime('')).toBe('Unknown')
  })
})

// ---------------------------------------------------------------------------
// getTierVariant
// ---------------------------------------------------------------------------
describe('getTierVariant', () => {
  it('returns "perfect" for green circle tier', () => {
    expect(getTierVariant({ Tier: '🟢 Perfect Match' })).toBe('perfect')
  })

  it('returns "good" for yellow circle tier', () => {
    expect(getTierVariant({ Tier: '🟡 Good Match' })).toBe('good')
  })

  it('returns "stretch" for orange circle tier', () => {
    expect(getTierVariant({ Tier: '🟠 Stretch Goal' })).toBe('stretch')
  })

  it('returns "skip" for red circle tier', () => {
    expect(getTierVariant({ Tier: '🔴 Skip' })).toBe('skip')
  })

  it('returns "neutral" when tier is missing or unknown', () => {
    expect(getTierVariant({})).toBe('neutral')
    expect(getTierVariant({ Tier: 'something else' })).toBe('neutral')
    expect(getTierVariant(null)).toBe('neutral')
  })
})

// ---------------------------------------------------------------------------
// getSourceLabel
// ---------------------------------------------------------------------------
describe('getSourceLabel', () => {
  it('returns the Source field when present', () => {
    expect(getSourceLabel({ Source: 'LinkedIn' })).toBe('LinkedIn')
  })

  it('returns "Web" when Source is missing', () => {
    expect(getSourceLabel({})).toBe('Web')
    expect(getSourceLabel(null)).toBe('Web')
  })
})

// ---------------------------------------------------------------------------
// getDisplayMatchScore
// ---------------------------------------------------------------------------
describe('getDisplayMatchScore', () => {
  it('prefers Fit Score over Skill Score', () => {
    expect(getDisplayMatchScore({ 'Fit Score': 88, 'Skill Score': 70 })).toBe(88)
  })

  it('falls back to Skill Score when Fit Score is absent', () => {
    expect(getDisplayMatchScore({ 'Skill Score': 72 })).toBe(72)
  })

  it('returns 0 when both are absent', () => {
    expect(getDisplayMatchScore({})).toBe(0)
    expect(getDisplayMatchScore(null)).toBe(0)
  })
})

// ---------------------------------------------------------------------------
// getMatchedSkills
// ---------------------------------------------------------------------------
describe('getMatchedSkills', () => {
  it('splits comma-separated skills', () => {
    const skills = getMatchedSkills({ 'Matched Skills': 'Python, React, SQL' })
    expect(skills).toEqual(['Python', 'React', 'SQL'])
  })

  it('respects the limit parameter', () => {
    const job = { 'Matched Skills': 'A, B, C, D, E, F' }
    expect(getMatchedSkills(job, 3)).toHaveLength(3)
  })

  it('defaults to a limit of 4', () => {
    const job = { 'Matched Skills': 'Skill1, Skill2, Skill3, Skill4, Skill5' }
    expect(getMatchedSkills(job)).toHaveLength(4)
  })

  it('filters out empty entries', () => {
    const skills = getMatchedSkills({ 'Matched Skills': ' , React,  , SQL' })
    expect(skills).toEqual(['React', 'SQL'])
  })

  it('returns empty array when Matched Skills is absent', () => {
    expect(getMatchedSkills({})).toEqual([])
    expect(getMatchedSkills(null)).toEqual([])
  })
})
