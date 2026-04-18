/**
 * Shared test fixtures and mock factories.
 */

export function makeJob(overrides = {}) {
  return {
    id: 1,
    job_id: 'match_1',
    Title: 'AI Engineer',
    Company: 'Acme Corp',
    Location: 'Remote',
    Status: 'not_applied',
    Source: 'LinkedIn',
    'Skill Score': 85,
    'Fit Score': 87,
    'Matched Skills': 'Python, PyTorch, React',
    'Date Found': '2025-06-15T12:00:00Z',
    Tier: '🟢 Perfect Match',
    Notes: '',
    'Special Interest': false,
    Industry: 'Developer Tools',
    Freshness: 'Fresh',
    'Search Query': 'AI Engineer',
    'AI Match Summary': '',
    'AI Match Reasons': [],
    'Experience Fit': 80,
    'Resume Match': 85,
    'Role Fit': 90,
    'Location Fit': 100,
    'Freshness Score': 95,
    ...overrides,
  }
}

export function makeEvent(overrides = {}) {
  return {
    id: 1,
    event_type: 'status_changed',
    label: 'Status changed to Applied',
    detail: 'Previously: Saved',
    created_at: '2025-06-15T12:00:00Z',
    old_status: 'not_applied',
    new_status: 'applied',
    ...overrides,
  }
}
