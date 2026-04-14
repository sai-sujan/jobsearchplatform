export const APPLIED_STATUSES = ['applied', 'interviewing', 'accepted']

export function getJobId(job) {
  return job?.job_id || `row-${job?._rowIndex ?? 'unknown'}`
}

export function normalizeStatus(status) {
  return (status || 'not_applied').toLowerCase()
}

export function isJobFromToday(job) {
  try {
    if (!job?.['Date Found']) return false
    const now = new Date()
    const date = new Date(job['Date Found'])
    return (
      date.getFullYear() === now.getFullYear() &&
      date.getMonth() === now.getMonth() &&
      date.getDate() === now.getDate()
    )
  } catch {
    return false
  }
}

export function formatDisplayDate(value) {
  if (!value) return 'Unknown date'
  try {
    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    }).format(new Date(value))
  } catch {
    return value
  }
}

export function formatCompactDate(value) {
  if (!value) return 'Recently added'
  try {
    return new Intl.DateTimeFormat('en-US', {
      month: 'numeric',
      day: 'numeric',
    }).format(new Date(value))
  } catch {
    return value
  }
}

export function formatDisplayDateTime(value) {
  if (!value) return 'Unknown'
  try {
    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    }).format(new Date(value))
  } catch {
    return value
  }
}

export function getTierVariant(job) {
  const tier = job?.Tier || ''
  if (tier.includes('🟢')) return 'perfect'
  if (tier.includes('🟡')) return 'good'
  if (tier.includes('🟠')) return 'stretch'
  if (tier.includes('🔴')) return 'skip'
  return 'neutral'
}

export function getSourceLabel(job) {
  return job?.Source || 'Web'
}

export function getMatchedSkills(job, limit = 4) {
  return (job?.['Matched Skills'] || '')
    .split(',')
    .map((skill) => skill.trim())
    .filter(Boolean)
    .slice(0, limit)
}
