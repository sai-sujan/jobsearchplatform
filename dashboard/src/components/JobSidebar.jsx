import { useEffect, useMemo, useState } from 'react'
import './JobSidebar.css'
import { api, API_URL } from '../lib/api'
import {
  formatDisplayDate,
  formatDisplayDateTime,
  getMatchedSkills,
  getSourceLabel,
  normalizeStatus,
} from '../lib/jobs'

const STATUS_OPTIONS = [
  { value: 'not_applied', label: 'Saved' },
  { value: 'applied', label: 'Applied' },
  { value: 'interviewing', label: 'Interviewing' },
  { value: 'accepted', label: 'Offer' },
  { value: 'skipped', label: 'Archived' },
]

const STATUS_TIMELINE = [
  { value: 'not_applied', label: 'Saved', hint: 'Ready to review.' },
  { value: 'applied', label: 'Applied', hint: 'Submitted.' },
  { value: 'interviewing', label: 'Interviewing', hint: 'In process.' },
  { value: 'accepted', label: 'Offer', hint: 'Offer received.' },
  { value: 'skipped', label: 'Archived', hint: 'Closed out.' },
]

const WORKSPACE_TABS = [
  { id: 'notes', label: 'Notes' },
  { id: 'overview', label: 'Overview' },
  { id: 'details', label: 'Job Details' },
  { id: 'company', label: 'Company' },
]

const GENERIC_TECH_STACK_TEMPLATE = {
  'Core Skills': [],
  'Tools & Platforms': [],
  'Domain Knowledge': [],
  'Workflow Strengths': [],
}

function buildInitialTechStack(job, existingTechStack = {}) {
  if (Object.keys(existingTechStack).length > 0) {
    return existingTechStack
  }

  const matchedSkills = (job?.['Matched Skills'] || '')
    .split(',')
    .map((skill) => skill.trim())
    .filter(Boolean)

  const title = job?.Title || job?.['Search Query'] || ''
  const location = job?.Location || ''

  return {
    ...GENERIC_TECH_STACK_TEMPLATE,
    'Core Skills': matchedSkills,
    'Domain Knowledge': title ? [title] : [],
    'Workflow Strengths': location ? [location] : [],
  }
}

function parseAnalysisData(job) {
  try {
    if (job?.['Analysis Data']) {
      return job['Analysis Data']
    }

    if (job?.['Analysis JSON']) {
      return typeof job['Analysis JSON'] === 'string'
        ? JSON.parse(job['Analysis JSON'])
        : job['Analysis JSON']
    }
  } catch (error) {
    console.error('Failed to parse analysis JSON:', error)
  }

  return null
}

function normalizeData(job, data) {
  if (!job) {
    return {
      location: '',
      tech_stack: {},
      suggested_tech_stack: {},
      points: [],
      ats_score: 'N/A',
    }
  }

  if (!data) {
    return {
      location: job.Location || '',
      tech_stack: buildInitialTechStack(job),
      suggested_tech_stack: {},
      points: [],
      ats_score: job.ats_score || 'N/A',
    }
  }

  let atsScore = data.ats_score || data.ai_ats_score || job.ats_score || 'N/A'
  if (atsScore !== 'N/A') {
    atsScore = parseInt(atsScore, 10) || 0
  }

  let location = data.location || job.Location || ''
  if (location && !location.toLowerCase().includes('relocate')) {
    location += ' (Open to Relocate)'
  }

  let techStack = data.tech_stack || {}
  let suggestedTechStack = data.suggested_tech_stack || {}

  if (Object.keys(suggestedTechStack).length === 0) {
    if (Object.keys(techStack).length > 0) {
      suggestedTechStack = { ...techStack }
    }
    techStack = buildInitialTechStack(job)
  }

  let points = []
  if (Array.isArray(data.points)) {
    points = data.points
  } else {
    if (data.suggested_resume_point_1) points.push(data.suggested_resume_point_1)
    if (data.suggested_resume_point_2) points.push(data.suggested_resume_point_2)
  }

  return {
    location,
    tech_stack: techStack,
    suggested_tech_stack: suggestedTechStack,
    points,
    ats_score: atsScore,
  }
}

function getCompanyMonogram(company) {
  const initials = (company || 'Job')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0])
    .join('')
    .toUpperCase()

  return initials || 'JA'
}

function getTimelineState(currentStatus, stepValue) {
  if (currentStatus === 'skipped') {
    return stepValue === 'skipped' ? 'current' : 'upcoming'
  }

  const orderedFlow = ['not_applied', 'applied', 'interviewing', 'accepted']
  const currentIndex = Math.max(orderedFlow.indexOf(currentStatus), 0)
  const stepIndex = orderedFlow.indexOf(stepValue)

  if (stepValue === 'skipped') {
    return 'upcoming'
  }

  if (stepIndex < currentIndex) return 'complete'
  if (stepIndex === currentIndex) return 'current'
  return 'upcoming'
}

function copyText(text, setMessage) {
  navigator.clipboard.writeText(text || '')
  setMessage('Copied to clipboard.')
  window.setTimeout(() => setMessage(''), 1800)
}

function getContactInfo(job) {
  const contact = job?.['Contact Info']
  if (!contact || typeof contact !== 'object') return {}
  return contact
}

function hasContactInfo(job) {
  const contact = getContactInfo(job)
  return Boolean(contact.name || contact.email || contact.phone)
}

function cleanContactRaw(raw) {
  return String(raw || '')
    .split(/\n+/)
    .map((line) => line.trim())
    .filter((line) => line && !/^(contact the job poster|view profile)$/i.test(line))
    .join('\n')
}

function contactCopyText(contact) {
  const raw = cleanContactRaw(contact.raw)
  return [
    contact.name,
    contact.title,
    contact.company,
    contact.email,
    contact.phone,
    raw,
  ].filter(Boolean).join('\n')
}

function linkedInSearchUrl(contact, job) {
  const query = [contact.name, contact.company || job?.Company, 'LinkedIn']
    .filter(Boolean)
    .join(' ')
  return `https://www.linkedin.com/search/results/people/?keywords=${encodeURIComponent(query)}`
}

function getHumanReadableScore(score) {
  if (score === 'N/A' || !score) return 'Unscored'
  if (score >= 85) return 'Top match'
  if (score >= 70) return 'Strong fit'
  if (score >= 50) return 'Good fit'
  return 'Possible fit'
}

function JobSidebar({ job, onClose, onStatusChange, onDelete, onNext, onPrev, hasNext, hasPrev }) {
  const analysisData = useMemo(() => parseAnalysisData(job), [job])
  const normalizedData = useMemo(() => normalizeData(job, analysisData), [analysisData, job])

  const [activeTab, setActiveTab] = useState('overview')
  const [editMode, setEditMode] = useState(false)
  const [editedData, setEditedData] = useState(normalizedData)
  const [originalData, setOriginalData] = useState(normalizedData)
  const [saving, setSaving] = useState(false)
  const [jsonMode, setJsonMode] = useState(false)
  const [jsonText, setJsonText] = useState('')
  const [jsonError, setJsonError] = useState('')
  const [saveMessage, setSaveMessage] = useState('')

  const [generating, setGenerating] = useState(false)
  const [pdfUrl, setPdfUrl] = useState(null)
  const [generateError, setGenerateError] = useState('')

  const [tailoring, setTailoring] = useState(false)
  const [tailorError, setTailorError] = useState('')
  const [aiMatchLoading, setAiMatchLoading] = useState(false)
  const [aiMatchError, setAiMatchError] = useState('')
  const [aiMatch, setAiMatch] = useState({
    score: job?.['AI Match Score'] ?? null,
    confidence: job?.['AI Match Confidence'] || '',
    summary: job?.['AI Match Summary'] || '',
    reasons: job?.['AI Match Reasons'] || [],
  })

  const [isSpecialInterest, setIsSpecialInterest] = useState(false)
  const [notesText, setNotesText] = useState('')
  const [notesSaving, setNotesSaving] = useState(false)
  const [notesError, setNotesError] = useState('')
  const [statusEvents, setStatusEvents] = useState([])
  const [eventsError, setEventsError] = useState('')
  const [resumeHistory, setResumeHistory] = useState([])
  const [resumeHistoryError, setResumeHistoryError] = useState('')
  const [activityTick, setActivityTick] = useState(0)
  const [statusMenuOpen, setStatusMenuOpen] = useState(false)
  const [pendingStatus, setPendingStatus] = useState(null)

  useEffect(() => {
    if (!job) return undefined

    setActiveTab(hasContactInfo(job) ? 'details' : 'notes')
    setEditMode(false)
    setJsonMode(false)
    setJsonText('')
    setJsonError('')
    setSaveMessage('')
    setGenerateError('')
    setPdfUrl(null)
    setTailorError('')
    setAiMatchLoading(false)
    setAiMatchError('')
    setAiMatch({
      score: job?.['AI Match Score'] ?? null,
      confidence: job?.['AI Match Confidence'] || '',
      summary: job?.['AI Match Summary'] || '',
      reasons: job?.['AI Match Reasons'] || [],
    })
    setIsSpecialInterest(Boolean(job['Special Interest']))
    setNotesText(job['Notes'] || '')
    setNotesSaving(false)
    setNotesError('')
    setStatusMenuOpen(false)
    setPendingStatus(null)
    setStatusEvents([])
    setEventsError('')
    setResumeHistory([])
    setResumeHistoryError('')
    setEditedData(normalizedData)
    setOriginalData(normalizedData)

    return undefined
  }, [job, normalizedData])

  useEffect(() => {
    if (!job) return undefined

    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = 'unset'
    }
  }, [job])

  useEffect(() => {
    if (!job?.id) return undefined

    let cancelled = false
    const loadAiMatch = async () => {
      if (job['AI Match Summary']) {
        return
      }
      setAiMatchLoading(true)
      setAiMatchError('')
      try {
        const response = await api.get(`/api/jobs/${job.id}/match-intelligence`)
        if (cancelled) return
        const payload = response.data?.match_intelligence || {}
        setAiMatch({
          score: payload.ai_match_score ?? null,
          confidence: payload.confidence || '',
          summary: payload.summary || '',
          reasons: payload.reasons || [],
        })
      } catch (error) {
        if (cancelled) return
        setAiMatchError(error?.response?.data?.detail || 'Unable to load AI match insights right now.')
      } finally {
        if (!cancelled) {
          setAiMatchLoading(false)
        }
      }
    }
    loadAiMatch()
    return () => {
      cancelled = true
    }
  }, [job])

  useEffect(() => {
    if (!job?.id) return undefined

    let cancelled = false
    const loadResumeHistory = async () => {
      try {
        const response = await api.get(`/api/jobs/${job.id}/resumes`)
        if (cancelled) return
        setResumeHistory(response.data?.resumes || [])
      } catch (error) {
        if (cancelled) return
        setResumeHistoryError(error?.response?.data?.detail || 'Unable to load saved resume versions.')
      }
    }

    loadResumeHistory()
    return () => {
      cancelled = true
    }
  }, [job, activityTick])

  useEffect(() => {
    if (!job?.id) return undefined

    let cancelled = false
    const loadEvents = async () => {
      try {
        const response = await api.get(`/api/jobs/${job.id}/events`)
        if (cancelled) return
        setStatusEvents(response.data?.events || [])
      } catch (error) {
        if (cancelled) return
        setEventsError(error?.response?.data?.detail || 'Unable to load recent status updates.')
      }
    }

    loadEvents()
    return () => {
      cancelled = true
    }
  }, [job, activityTick])

  if (!job) return null

  const currentStatus = normalizeStatus(job.Status)
  const displayStatus = pendingStatus || currentStatus
  const currentStatusOption = STATUS_OPTIONS.find((option) => option.value === displayStatus) || STATUS_OPTIONS[0]
  const currentTimelineStep = STATUS_TIMELINE.find((step) => step.value === currentStatus) || STATUS_TIMELINE[0]
  const flowStatuses = STATUS_TIMELINE.filter((step) => step.value !== 'skipped')
  const currentFlowIndex = currentStatus === 'skipped'
    ? flowStatuses.length - 1
    : Math.max(flowStatuses.findIndex((step) => step.value === currentStatus), 0)
  const progressPercent = currentStatus === 'skipped'
    ? 100
    : Math.round((currentFlowIndex / Math.max(flowStatuses.length - 1, 1)) * 100)
  const nextTimelineStep = currentStatus === 'skipped'
    ? null
    : flowStatuses[Math.min(currentFlowIndex + 1, flowStatuses.length - 1)]
  const matchScore = editedData.ats_score !== 'N/A' ? Number(editedData.ats_score) || 0 : 'N/A'
  const scoreForRing = typeof matchScore === 'number' ? Math.max(0, Math.min(matchScore, 100)) : 0
  const fitSignalItems = [
    {
      label: 'Skills Match',
      value: matchScore === 'N/A' ? 'Unscored' : (matchScore > 80 ? 'High' : (matchScore > 60 ? 'Medium' : 'Partial')),
      fill: matchScore === 'N/A' ? 0 : (matchScore > 80 ? 88 : (matchScore > 60 ? 64 : 40)),
    },
    {
      label: 'Experience',
      value: matchScore === 'N/A' ? 'Unscored' : (matchScore > 75 ? 'Full' : 'Strong'),
      fill: matchScore === 'N/A' ? 0 : (matchScore > 75 ? 84 : 70),
    },
    {
      label: 'Domain',
      value: matchScore === 'N/A' ? 'Unscored' : 'Relevant',
      fill: matchScore === 'N/A' ? 0 : 72,
    },
  ]
  const statusCopy = {
    not_applied: {
      headline: 'Saved',
      detail: 'Review the fit, tailor your resume, then submit when ready.',
      actionLabel: 'Mark applied',
      actionStatus: 'applied',
      nextLabel: 'Apply',
    },
    applied: {
      headline: 'Applied',
      detail: 'Application is submitted. Track replies, follow-ups, and recruiter signals here.',
      actionLabel: 'Move to interviewing',
      actionStatus: 'interviewing',
      nextLabel: 'Interviewing',
    },
    interviewing: {
      headline: 'Interviewing',
      detail: 'You are in motion. Use notes for prep, recruiter names, and deadlines.',
      actionLabel: 'Mark offer',
      actionStatus: 'accepted',
      nextLabel: 'Offer',
    },
    accepted: {
      headline: 'Offer',
      detail: 'Offer received. Keep negotiation notes and next-step details here.',
      actionLabel: 'Archive when done',
      actionStatus: 'skipped',
      nextLabel: 'Decision',
    },
    skipped: {
      headline: 'Archived',
      detail: 'This role is closed out. Restore it if you want to work on it again.',
      actionLabel: 'Restore to saved',
      actionStatus: 'not_applied',
      nextLabel: 'Saved',
    },
  }[currentStatus] || {
    headline: currentTimelineStep.label,
    detail: currentTimelineStep.hint,
    actionLabel: 'Update status',
    actionStatus: 'not_applied',
    nextLabel: nextTimelineStep?.label || 'Next',
  }
  const sourceLabel = getSourceLabel(job)
  const matchedSkills = getMatchedSkills(job, 12)
  const companyMonogram = getCompanyMonogram(job.Company)
  const contactInfo = getContactInfo(job)
  const contactAvailable = hasContactInfo(job)
  const stackEntries = Object.entries(editedData.tech_stack || {})
  const suggestedEntries = Object.entries(editedData.suggested_tech_stack || {})
  const rawPreview = JSON.stringify(
    {
      title: job.Title,
      company: job.Company,
      source: sourceLabel,
      status: currentStatus,
      link: job.Link,
      analysis: editedData,
      notes: notesText,
      matched_skills: matchedSkills,
      ai_match: aiMatch,
    },
    null,
    2,
  )

  const summaryItems = [
    { label: 'Location', value: editedData.location || job.Location || 'Remote / flexible' },
    { label: 'Source', value: sourceLabel },
    { label: 'Industry', value: job.Industry || 'Generalist role' },
    { label: 'Freshness', value: job.Freshness || 'Recently delivered' },
    { label: 'Search', value: job['Search Query'] || 'Imported opportunity' },
    { label: 'Saved', value: formatDisplayDate(job['Date Found']) },
  ]

  const fitBreakdownItems = [
    { label: 'Experience', value: job['Experience Fit'] },
    { label: 'Resume', value: job['Resume Match'] },
    { label: 'Role', value: job['Role Fit'] },
    { label: 'Location', value: job['Location Fit'] },
    { label: 'Freshness', value: job['Freshness Score'] },
  ].filter((item) => typeof item.value === 'number')

  const handleEdit = () => {
    setEditMode(true)
    setJsonMode(false)
    setActiveTab('match')
    setSaveMessage('')
  }

  const handleCancel = () => {
    setEditedData(originalData)
    setEditMode(false)
    setJsonMode(false)
    setJsonText('')
    setJsonError('')
    setSaveMessage('')
  }

  const handleJsonToggle = () => {
    if (!jsonMode) {
      setJsonText(JSON.stringify(editedData, null, 2))
      setJsonError('')
      setActiveTab('data')
      setJsonMode(true)
      return
    }

    try {
      const parsed = JSON.parse(jsonText)
      setEditedData(parsed)
      setJsonError('')
      setJsonMode(false)
    } catch (error) {
      setJsonError(`Invalid JSON: ${error.message}`)
    }
  }

  const handleToggleSpecialInterest = async () => {
    const nextValue = !isSpecialInterest
    setIsSpecialInterest(nextValue)

    try {
      await api.patch(`/api/jobs/${job.id}/interest`, null, {
        params: { special_interest: nextValue },
      })
    } catch (error) {
      console.error('Failed to update special interest:', error)
      setIsSpecialInterest(!nextValue)
    }
  }

  const handleSaveNotes = async () => {
    setNotesSaving(true)
    setNotesError('')

    try {
      await api.patch(`/api/jobs/${job.id}/notes`, null, {
        params: { notes: notesText },
      })
      setNotesError('Notes saved.')
      window.setTimeout(() => setNotesError(''), 2200)
      setActivityTick((t) => t + 1)
    } catch (error) {
      console.error('Failed to save notes:', error)
      if (error?.response?.status === 403) {
        setNotesError('Your session expired. Refresh and try again.')
      } else {
        setNotesError('Network error while saving notes.')
      }
    } finally {
      setNotesSaving(false)
    }
  }

  const handleSave = async () => {
    let dataToSave = editedData

    if (jsonMode) {
      try {
        dataToSave = JSON.parse(jsonText)
        setEditedData(dataToSave)
        setJsonError('')
      } catch {
        setJsonError('Cannot save until the JSON is valid.')
        return
      }
    }

    setSaving(true)
    setSaveMessage('')

    try {
      await api.patch(`/api/jobs/${job.id}/analysis`, {
        ats_score: dataToSave.ats_score !== 'N/A' ? parseInt(dataToSave.ats_score, 10) : null,
        location: dataToSave.location,
        tech_stack: dataToSave.tech_stack,
        suggested_tech_stack: dataToSave.suggested_tech_stack,
        points: dataToSave.points,
      })

      setOriginalData(dataToSave)
      setEditedData(dataToSave)
      setEditMode(false)
      setJsonMode(false)
      setSaveMessage('Workspace changes saved.')
      window.setTimeout(() => setSaveMessage(''), 2600)
      setActivityTick((t) => t + 1)
    } catch (error) {
      console.error('Save error:', error)
      setSaveMessage(`Unable to save changes: ${error.response?.data?.detail || error.message}`)
    } finally {
      setSaving(false)
    }
  }

  const handleAutoTailor = async () => {
    setTailoring(true)
    setTailorError('')
    setSaveMessage('')
    setActiveTab('match')

    try {
      const response = await api.post(`/api/jobs/${job.id}/tailor`)
      const tailoredData = response.data?.tailored_data || {}
      setEditedData((current) => ({
        ...current,
        ats_score: tailoredData.ats_score || current.ats_score,
        location: tailoredData.location || current.location,
        suggested_tech_stack: tailoredData.suggested_tech_stack || current.suggested_tech_stack,
        points: tailoredData.points || current.points,
      }))
      setSaveMessage('New AI suggestions are ready to review.')
      setActivityTick((t) => t + 1)
    } catch (error) {
      console.error('Auto tailor error:', error)
      setTailorError(`Tailor failed: ${error?.response?.data?.detail || error.message}`)
    } finally {
      setTailoring(false)
    }
  }

  const handleGenerateResume = async () => {
    setGenerating(true)
    setGenerateError('')
    setPdfUrl(null)
    setActiveTab('resume')

    try {
      const response = await api.post(`/api/jobs/${job.id}/resume`)
      setPdfUrl(response.data?.pdf_url || null)
      setActivityTick((t) => t + 1)
    } catch (error) {
      console.error('Generate resume error:', error)
      setGenerateError(error?.response?.data?.detail || 'Resume generation failed. Refresh suggestions and try again.')
    } finally {
      setGenerating(false)
    }
  }

  const handleTechStackChange = (category, value) => {
    const skills = value
      .split(',')
      .map((skill) => skill.trim())
      .filter(Boolean)

    setEditedData((current) => ({
      ...current,
      tech_stack: {
        ...current.tech_stack,
        [category]: skills,
      },
    }))
  }

  const handleTechStackKeyChange = (oldKey, nextKey) => {
    const trimmed = nextKey.trim()

    if (!trimmed || trimmed === oldKey || editedData.tech_stack[trimmed]) return

    const nextStack = { ...editedData.tech_stack, [trimmed]: editedData.tech_stack[oldKey] }
    delete nextStack[oldKey]

    setEditedData((current) => ({
      ...current,
      tech_stack: nextStack,
    }))
  }

  const handleTechStackDelete = (category) => {
    const nextStack = { ...editedData.tech_stack }
    delete nextStack[category]
    setEditedData((current) => ({
      ...current,
      tech_stack: nextStack,
    }))
  }

  const handleTechStackAdd = () => {
    const existing = new Set(Object.keys(editedData.tech_stack || {}))
    let index = 1
    let nextName = 'New Category'

    while (existing.has(nextName)) {
      index += 1
      nextName = `New Category ${index}`
    }

    setEditedData((current) => ({
      ...current,
      tech_stack: {
        ...current.tech_stack,
        [nextName]: [],
      },
    }))
  }

  const handleAddSuggestedSkill = (category, skill) => {
    setEditedData((current) => {
      const existing = current.tech_stack?.[category] || []
      if (existing.includes(skill)) return current

      return {
        ...current,
        tech_stack: {
          ...current.tech_stack,
          [category]: [...existing, skill],
        },
      }
    })
  }

  const handlePointChange = (index, value) => {
    const nextPoints = [...editedData.points]
    nextPoints[index] = value
    setEditedData((current) => ({
      ...current,
      points: nextPoints,
    }))
  }

  const handlePointDelete = (index) => {
    setEditedData((current) => ({
      ...current,
      points: current.points.filter((_, pointIndex) => pointIndex !== index),
    }))
  }

  const handlePointAdd = () => {
    setEditedData((current) => ({
      ...current,
      points: [...current.points, '\\item Add a tailored impact bullet'],
    }))
  }

  return (
    <div className="job-detail-overlay" onClick={onClose}>
      <aside className="job-detail-panel" onClick={(event) => event.stopPropagation()}>
        <header className="job-detail-header">
          <div className="job-detail-title-row">
            <div className="job-detail-avatar">{companyMonogram}</div>
            <div className="job-detail-heading-copy">
              <span className="job-detail-kicker">{sourceLabel} &middot; {getHumanReadableScore(matchScore)}</span>
              <h2>{job.Title || 'Untitled role'}</h2>
              <div className="trust-row">
                <span>{job.Company || 'Unknown company'}</span>
                <span>&middot;</span>
                <span>{editedData.location || job.Location || 'Remote / flexible'}</span>
                <span>&middot;</span>
                <span>{job['Job Type'] || 'Full-time'}</span>
                {job['Employment Type'] && (
                  <>
                    <span>&middot;</span>
                    <span>{job['Employment Type']}</span>
                  </>
                )}
                {contactAvailable && (
                  <>
                    <span>&middot;</span>
                    <span>Contact saved</span>
                  </>
                )}
                <span>&middot;</span>
                <span>Posted {formatDisplayDate(job['Date Found'])}</span>
              </div>
              
              <div className="job-detail-dominant-cta">
                <a
                  href={job.Link || '#'}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="detail-button primary-apply"
                >
                  Apply for this role
                </a>
                {!editMode && !jsonMode && (
                  <button
                    type="button"
                    className="detail-button ai-tailor-btn"
                    onClick={handleAutoTailor}
                    disabled={tailoring}
                  >
                    {tailoring ? 'Tailoring...' : 'Tailor Resume with AI'}
                  </button>
                )}
              </div>
              
              {!tailoring && !editMode && !jsonMode && (
                <div className="tailor-preview">
                  <p><strong>What tailoring will do:</strong> Highlight matching skills, reorder experience to emphasize relevance, and strengthen your summary.</p>
                </div>
              )}
            </div>
          </div>

          <div className="job-detail-actions top-actions">
            <div className="job-detail-nav">
              <button type="button" className="detail-nav-button" onClick={onPrev} disabled={!hasPrev}>
                Prev
              </button>
              <button type="button" className="detail-nav-button" onClick={onNext} disabled={!hasNext}>
                Next
              </button>
            </div>

            <div className="job-detail-action-group">
              {editMode ? (
                <>
                  <button type="button" className="detail-button subtle" onClick={handleJsonToggle}>
                    {jsonMode ? 'Structured editor' : 'Raw JSON'}
                  </button>
                  <button type="button" className="detail-button subtle" onClick={handleCancel} disabled={saving}>
                    Cancel
                  </button>
                  <button type="button" className="detail-button primary" onClick={handleSave} disabled={saving}>
                    {saving ? 'Saving...' : 'Save changes'}
                  </button>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    className={`detail-chip ${isSpecialInterest ? 'active' : ''}`}
                    onClick={handleToggleSpecialInterest}
                  >
                    {isSpecialInterest ? 'Priority role' : 'Mark priority'}
                  </button>
                  <button type="button" className="detail-button subtle" onClick={handleEdit}>
                    Edit workspace
                  </button>
                  <button
                    type="button"
                    className="detail-button danger"
                    onClick={() => {
                      if (window.confirm('Delete this role from the board? This cannot be undone.')) {
                        onDelete(job)
                      }
                    }}
                  >
                    Delete
                  </button>
                </>
              )}

              <button type="button" className="detail-close" onClick={onClose} aria-label="Close detail panel">
                Close
              </button>
            </div>
          </div>
        </header>

        <section className="job-detail-meta-strip visually-hidden" aria-hidden="true">
          {/* Legacy strip was removed entirely, data shifted to trust-row */}
        </section>

        <nav className="job-detail-tabs" aria-label="Job detail tabs">
          {WORKSPACE_TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              className={`job-detail-tab ${activeTab === tab.id ? 'active' : ''}`}
              onClick={() => setActiveTab(tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </nav>

        <div className="job-detail-body">
          <main className="job-detail-main">
            {saveMessage && <div className="detail-alert success">{saveMessage}</div>}
            {generateError && <div className="detail-alert error">{generateError}</div>}
            {tailorError && <div className="detail-alert error">{tailorError}</div>}
            {jsonError && <div className="detail-alert error">{jsonError}</div>}

            {activeTab === 'overview' && (
              <div className="job-detail-main">
                {/* Module 1: Improve your chances */}
                <div className="detail-module-card animate-reveal">
                  <header className="module-header">
                    <span className="module-title">Coaching</span>
                    <h3 className="module-sub-title">Improve your chances</h3>
                  </header>
                  {aiMatchLoading ? (
                    <div className="workspace-stack">
                      <div className="skeleton" style={{ height: '40px', width: '100%' }}></div>
                      <div className="skeleton" style={{ height: '40px', width: '100%' }}></div>
                    </div>
                  ) : (
                    <div className="workspace-stack">
                      <div className="severity-row">
                        <span className="severity-pill strong"></span>
                        <span className="severity-text">Highlight {matchedSkills.length > 0 ? matchedSkills[0] : 'core tools'} in your professional summary</span>
                      </div>
                      <div className="severity-row">
                        <span className="severity-pill improve"></span>
                        <span className="severity-text">Add more detail to your {job.Title || 'Role'} experience points</span>
                      </div>
                    </div>
                  )}
                </div>

                {/* Module 3: Next best action */}
                <div 
                  className={`next-action-card animate-reveal ${matchScore > 85 ? 'priority-pulse' : ''}`}
                  style={{ animationDelay: '0.2s' }}
                >
                  <span className="next-action-header">Strategic Guidance</span>
                  <div className="next-action-body">
                    {aiMatchLoading ? 'Calculating best approach...' : (matchScore > 85 ? 'Apply Now (Strong fit)' : 'Tailor Resume First')}
                  </div>
                  <div className="next-action-footer">
                    {aiMatchLoading ? 'Please wait while we cross-reference your profile...' : (matchScore > 85 
                      ? 'You have a high probability of success. We recommend submitting your curated application immediately.' 
                      : 'Alignment is good, but tailoring will significantly increase your ATS visibility.')}
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'notes' && (
              <div className="workspace-stack">
                <section className="workspace-section">
                  <div className="section-topline">
                    <div>
                      <p className="section-kicker">Working area</p>
                      <h3>Notes</h3>
                    </div>
                    <button
                      type="button"
                      className="mini-action"
                      onClick={handleSaveNotes}
                      disabled={notesSaving}
                    >
                      {notesSaving ? 'Saving...' : 'Save notes'}
                    </button>
                  </div>

                  {notesError && <p className="inline-note">{notesError}</p>}

                  <textarea
                    className="rail-notes main-notes"
                    value={notesText}
                    onChange={(event) => setNotesText(event.target.value)}
                    placeholder="Capture recruiter names, interview prep, deadlines, follow-ups, and role-specific reminders."
                  />
                </section>

                <section className="workspace-section">
                  <div className="section-topline">
                    <div>
                      <p className="section-kicker">Activity</p>
                      <h3>Timeline</h3>
                    </div>
                  </div>

                  {eventsError && <p className="inline-note">{eventsError}</p>}

                  {statusEvents.length > 0 ? (
                    <div className="timeline-history main-timeline">
                      {statusEvents.slice(0, 10).map((event) => (
                        <div key={event.id} className={`timeline-history-item timeline-event-${event.event_type || 'unknown'}`}>
                          <strong>{event.label || event.event_type}</strong>
                          {event.detail && <p className="timeline-event-detail">{event.detail}</p>}
                          <p className="timeline-event-time">{formatDisplayDate(event.created_at)}</p>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="empty-copy">No tracked activity yet. Status changes and updates will appear here.</p>
                  )}
                </section>
              </div>
            )}

            {activeTab === 'details' && (
              <div className="job-detail-main">
                {(job['Employment Type'] || contactAvailable) && (
                  <div className="detail-module-card job-contact-card" style={{ marginBottom: '12px' }}>
                    <header className="module-header">
                      <span className="module-title">Role Details</span>
                    </header>
                    {job['Employment Type'] && (
                      <div style={{ marginBottom: '10px' }}>
                        <span style={{ fontSize: '12px', color: 'var(--muted)', display: 'block', marginBottom: '6px' }}>Employment Type</span>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                          {job['Employment Type'].split(',').map((t) => t.trim()).filter(Boolean).map((type) => (
                            <span
                              key={type}
                              style={{
                                padding: '3px 10px',
                                borderRadius: '99px',
                                fontSize: '12px',
                                fontWeight: 600,
                                background: type === 'No C2C' ? '#fee2e2' : type === 'C2C' ? '#fef3c7' : type === 'Contract W2' ? '#d1fae5' : type === 'W2' ? '#dcfce7' : type === '1099' ? '#fce7f3' : type === 'Onsite Interview' ? '#f0f9ff' : '#e0e7ff',
                                color: type === 'No C2C' ? '#991b1b' : type === 'C2C' ? '#92400e' : type === 'Contract W2' ? '#065f46' : type === 'W2' ? '#166534' : type === '1099' ? '#9d174d' : type === 'Onsite Interview' ? '#0369a1' : '#3730a3',
                              }}
                            >
                              {type}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                    {contactAvailable && (
                      <div className="contact-info-block">
                        <span className="contact-info-label">Recruiter Contact</span>
                        <div className="contact-info-panel">
                          <div>
                            <strong>{contactInfo.name || 'Contact saved'}</strong>
                            {(contactInfo.title || contactInfo.company) && (
                              <p>{contactInfo.title || contactInfo.company}</p>
                            )}
                          </div>
                          <div className="contact-info-actions">
                            {contactInfo.name && (
                              <a href={linkedInSearchUrl(contactInfo, job)} target="_blank" rel="noopener noreferrer">
                                Find on LinkedIn
                              </a>
                            )}
                            <button type="button" onClick={() => copyText(contactCopyText(contactInfo), setSaveMessage)}>
                              Copy contact
                            </button>
                          </div>
                        </div>
                        <div className="contact-info-lines">
                          {contactInfo.email && (
                            <a href={`mailto:${contactInfo.email}`}>
                              {contactInfo.email}
                            </a>
                          )}
                          {contactInfo.phone && (
                            <a href={`tel:${contactInfo.phone}`}>
                              {contactInfo.phone}
                            </a>
                          )}
                          {contactInfo.company && <span>{contactInfo.company}</span>}
                        </div>
                        {cleanContactRaw(contactInfo.raw) && <pre className="contact-info-raw">{cleanContactRaw(contactInfo.raw)}</pre>}
                      </div>
                    )}
                  </div>
                )}
                <div className="detail-module-card">
                    <header className="module-header">
                      <span className="module-title">Job Posting</span>
                      <button
                        type="button"
                        className="mini-action"
                        onClick={() => copyText(job['Job Description'] || '', setSaveMessage)}
                      >
                        Copy text
                      </button>
                    </header>
                    <div className="job-description-panel" style={{ fontSize: '15px', lineHeight: '1.6', color: 'var(--slate-600)' }}>
                      {job['Job Description'] || 'No job description has been saved for this role yet.'}
                    </div>
                </div>
              </div>
            )}

            {activeTab === 'company' && (
               <div className="job-detail-main">
                 <div className="detail-module-card">
                    <header className="module-header">
                       <span className="module-title">Employer Info</span>
                       <h3 className="module-sub-title">{job.Company || 'The Company'}</h3>
                    </header>
                    <div className="snapshot-grid">
                      <div className="snapshot-card">
                        <span>Industry</span>
                        <strong>Design & Tech</strong>
                      </div>
                      <div className="snapshot-card">
                        <span>Size</span>
                        <strong>1,000+ employees</strong>
                      </div>
                    </div>
                    <p style={{ color: 'var(--slate-600)', lineHeight: '1.6' }}>
                      {job.Company} is a leading innovator in their space. This role offers an opportunity to work on high-scale systems and impact millions of users across the globe.
                    </p>
                 </div>
               </div>
            )}

            {activeTab === 'match' && (
              <div className="workspace-stack">
                <section className="workspace-section">
                  <div className="section-topline">
                    <div>
                      <p className="section-kicker">Fit workspace</p>
                      <h3>Resume fit</h3>
                    </div>
                    {!editMode && (
                      <button type="button" className="mini-action" onClick={handleEdit}>
                        Edit fit
                      </button>
                    )}
                  </div>

                  <div className="match-summary-grid">
                    <div className="score-panel">
                      <span className="score-panel-label">ATS alignment</span>
                      {editMode ? (
                        <label className="score-editor">
                          <span>Score</span>
                          <input
                            type="number"
                            min="0"
                            max="100"
                            value={editedData.ats_score === 'N/A' ? '' : editedData.ats_score}
                            onChange={(event) =>
                              setEditedData((current) => ({
                                ...current,
                                ats_score: event.target.value ? parseInt(event.target.value, 10) : 0,
                              }))
                            }
                            placeholder="0"
                          />
                        </label>
                      ) : (
                        <div
                          className="score-ring-label"
                        >
                          <span style={{ fontSize: '1.25rem', fontWeight: 700, color: '#4F46E5'}}>{getHumanReadableScore(matchScore)}</span>
                        </div>
                      )}
                    </div>

                    <div className="field-grid">
                      <label className="form-field">
                        <span>Target location</span>
                        {editMode ? (
                          <input
                            type="text"
                            value={editedData.location}
                            onChange={(event) =>
                              setEditedData((current) => ({
                                ...current,
                                location: event.target.value,
                              }))
                            }
                          />
                        ) : (
                          <p>{editedData.location || 'Remote / flexible'}</p>
                        )}
                      </label>

                      <div className="form-field">
                        <span>Source</span>
                        <p>{sourceLabel}</p>
                      </div>

                      <div className="form-field">
                        <span>Company</span>
                        <p>{job.Company || 'Unknown company'}</p>
                      </div>

                      <div className="form-field">
                        <span>Search track</span>
                        <p>{job['Search Query'] || 'Imported opportunity'}</p>
                      </div>
                    </div>
                  </div>
                </section>

                <section className="workspace-section">
                  <div className="section-topline">
                    <div>
                      <p className="section-kicker">Skill planning</p>
                      <h3>Stack</h3>
                    </div>
                    {editMode && (
                      <button type="button" className="mini-action" onClick={handleTechStackAdd}>
                        Add category
                      </button>
                    )}
                  </div>

                  <div className="stack-grid">
                    <div className="stack-surface">
                      <div className="stack-surface-header">
                        <h4>Your stack</h4>
                        <span>What will feed resume tailoring and PDF generation.</span>
                      </div>

                      {stackEntries.length > 0 ? (
                        stackEntries.map(([category, skills]) => (
                          <div key={category} className="stack-block">
                            <div className="stack-block-header">
                              {editMode ? (
                                <input
                                  type="text"
                                  className="stack-category-input"
                                  defaultValue={category}
                                  onBlur={(event) => handleTechStackKeyChange(category, event.target.value)}
                                  onKeyDown={(event) => {
                                    if (event.key === 'Enter') {
                                      event.preventDefault()
                                      event.currentTarget.blur()
                                    }
                                  }}
                                />
                              ) : (
                                <h5>{category}</h5>
                              )}

                              {editMode && (
                                <button
                                  type="button"
                                  className="stack-remove-button"
                                  onClick={() => handleTechStackDelete(category)}
                                >
                                  Remove
                                </button>
                              )}
                            </div>

                            {editMode ? (
                              <textarea
                                className="stack-skills-input"
                                value={(skills || []).join(', ')}
                                onChange={(event) => handleTechStackChange(category, event.target.value)}
                                placeholder="Add comma-separated skills"
                              />
                            ) : (
                              <div className="skill-pill-row muted">
                                {(skills || []).length > 0 ? (
                                  skills.map((skill) => (
                                    <span key={`${category}-${skill}`} className="skill-pill secondary">
                                      {skill}
                                    </span>
                                  ))
                                ) : (
                                  <p className="empty-copy">No skills recorded in this category yet.</p>
                                )}
                              </div>
                            )}
                          </div>
                        ))
                      ) : (
                        <p className="empty-copy">No stack categories yet. Add one to start tailoring.</p>
                      )}
                    </div>

                    <div className="stack-surface accent-surface">
                      <div className="stack-surface-header">
                        <h4>Suggested additions</h4>
                        <span>Click any suggestion to copy it into your stack.</span>
                      </div>

                      {suggestedEntries.length > 0 ? (
                        suggestedEntries.map(([category, skills]) => (
                          <div key={category} className="stack-block suggestion-block">
                            <div className="stack-block-header">
                              <h5>{category}</h5>
                            </div>

                            <div className="skill-pill-row">
                              {(skills || []).length > 0 ? (
                                skills.map((skill) => {
                                  const alreadyAdded = (editedData.tech_stack?.[category] || []).includes(skill)
                                  return (
                                    <button
                                      key={`${category}-${skill}`}
                                      type="button"
                                      className={`skill-pill-button ${alreadyAdded ? 'added' : ''}`}
                                      onClick={() => handleAddSuggestedSkill(category, skill)}
                                      disabled={alreadyAdded}
                                    >
                                      {skill}
                                    </button>
                                  )
                                })
                              ) : (
                                <p className="empty-copy">No suggestions in this category yet.</p>
                              )}
                            </div>
                          </div>
                        ))
                      ) : (
                        <p className="empty-copy">
                          Suggested stack data will appear here after analysis or AI tailoring.
                        </p>
                      )}
                    </div>
                  </div>
                </section>
              </div>
            )}

            {activeTab === 'resume' && (
              <div className="workspace-stack">
                <section className="workspace-section">
                  <div className="section-topline">
                    <div>
                      <p className="section-kicker">Resume draft</p>
                      <h3>Resume bullets</h3>
                    </div>
                    <div className="section-actions">
                      <button
                        type="button"
                        className="mini-action"
                        onClick={handleAutoTailor}
                        disabled={tailoring}
                      >
                        {tailoring ? 'Tailoring...' : 'Refresh suggestions'}
                      </button>
                      <button
                        type="button"
                        className="mini-action primary"
                        onClick={handleGenerateResume}
                        disabled={generating}
                      >
                        {generating ? 'Generating...' : 'Generate PDF'}
                      </button>
                    </div>
                  </div>

                  {editMode ? (
                    <div className="points-editor">
                      {editedData.points.map((point, index) => (
                        <div key={`point-${index}`} className="point-edit-card">
                          <textarea
                            className="point-textarea"
                            value={point}
                            onChange={(event) => handlePointChange(index, event.target.value)}
                          />
                          <button
                            type="button"
                            className="stack-remove-button"
                            onClick={() => handlePointDelete(index)}
                          >
                            Remove
                          </button>
                        </div>
                      ))}

                      <button type="button" className="mini-action" onClick={handlePointAdd}>
                        Add bullet
                      </button>
                    </div>
                  ) : editedData.points.length > 0 ? (
                    <ol className="resume-points-list">
                      {editedData.points.map((point, index) => (
                        <li key={`resume-point-${index}`}>{point.replace(/^\\item\s*/, '')}</li>
                      ))}
                    </ol>
                  ) : (
                    <p className="empty-copy">
                      No tailored bullets yet. Use AI tailoring or edit the workspace to add them.
                    </p>
                  )}
                </section>

                {pdfUrl && (
                  <section className="workspace-section">
                    <div className="section-topline">
                      <div>
                        <p className="section-kicker">Generated asset</p>
                        <h3>Latest resume PDF</h3>
                      </div>
                      <a
                        href={`${API_URL}${pdfUrl}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mini-action primary"
                      >
                        Download PDF
                      </a>
                    </div>

                    <iframe
                      src={`${API_URL}${pdfUrl}`}
                      title="Resume preview"
                      className="resume-preview-frame"
                    />
                  </section>
                )}

                {resumeHistory.length > 0 && (
                  <section className="workspace-section">
                    <div className="section-topline">
                      <div>
                        <p className="section-kicker">Stored assets</p>
                        <h3>Resume history</h3>
                      </div>
                    </div>

                    <div className="saved-resume-list">
                      {resumeHistory.map((resume) => (
                        <div key={resume.id} className="saved-resume-row">
                          <div>
                            <strong>{resume.filename || `Resume v${resume.version}`}</strong>
                            <p>
                              Version {resume.version}
                              {resume.created_at ? ` • ${formatDisplayDateTime(resume.created_at)}` : ''}
                            </p>
                          </div>
                          <a
                            href={`${API_URL}${resume.download_url}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="mini-action"
                          >
                            Download
                          </a>
                        </div>
                      ))}
                    </div>
                  </section>
                )}

                {resumeHistoryError && <p className="empty-copy">{resumeHistoryError}</p>}
              </div>
            )}

            {activeTab === 'data' && (
              <div className="workspace-stack">
                <section className="workspace-section">
                  <div className="section-topline">
                    <div>
                      <p className="section-kicker">Structured payload</p>
                      <h3>Raw data</h3>
                    </div>
                    {editMode && (
                      <button type="button" className="mini-action" onClick={handleJsonToggle}>
                        {jsonMode ? 'Use structured editor' : 'Edit as JSON'}
                      </button>
                    )}
                  </div>

                  {editMode && jsonMode ? (
                    <textarea
                      className="json-editor"
                      value={jsonText}
                      onChange={(event) => setJsonText(event.target.value)}
                    />
                  ) : (
                    <pre className="json-preview">{rawPreview}</pre>
                  )}
                </section>
              </div>
            )}
          </main>

          <aside className="job-detail-rail">
            <section className="workspace-section rail-card status-rail-card">
              <div className="status-card-head">
                <div>
                  <h3>Application status</h3>
                </div>
              </div>

              <div className="status-picker">
                <button
                  type="button"
                  className={`status-picker-trigger ${statusMenuOpen ? 'open' : ''} ${pendingStatus ? 'committing' : ''}`}
                  onClick={() => setStatusMenuOpen((open) => !open)}
                  aria-haspopup="listbox"
                  aria-expanded={statusMenuOpen}
                >
                  <span className={`status-dot status-${displayStatus}`} aria-hidden="true" />
                  <span>{currentStatusOption.label}</span>
                  <span className="status-chevron" aria-hidden="true" />
                </button>

                {statusMenuOpen && (
                  <div className="status-picker-menu" role="listbox" aria-label="Application status">
                    {STATUS_OPTIONS.map((option) => (
                      <button
                        key={option.value}
                        type="button"
                        role="option"
                        aria-selected={option.value === displayStatus}
                        className={`status-picker-option ${option.value === displayStatus ? 'selected' : ''}`}
                        onClick={() => {
                          setPendingStatus(option.value)
                          onStatusChange(job, option.value)
                          setStatusMenuOpen(false)
                        }}
                      >
                        <span className={`status-dot status-${option.value}`} aria-hidden="true" />
                        <span>{option.label}</span>
                        {option.value === displayStatus && <span className="status-check" aria-hidden="true" />}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div className="status-rail-divider" aria-hidden="true" />

              <div className="status-timeline status-timeline-rail" aria-label="Application pipeline">
                {STATUS_TIMELINE.map((step) => (
                  <div
                    key={step.value}
                    className={`timeline-step status-chip-${step.value} ${getTimelineState(currentStatus, step.value)}`}
                  >
                    <span className="timeline-dot" />
                    <div className="timeline-copy">
                      <strong>{step.label}</strong>
                      {step.value === currentStatus && statusEvents[0]?.created_at ? (
                        <p>{formatDisplayDate(statusEvents[0].created_at)}</p>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
            </section>

            <section className="workspace-section rail-card fit-intel-rail-card">
              <div className="fit-intel-head">
                <h3>AI Fit Intelligence</h3>
                <span className="status-fit-level">
                  {aiMatchLoading ? 'Loading' : (aiMatchError ? 'Error' : getHumanReadableScore(matchScore))}
                </span>
              </div>

              {aiMatchLoading ? (
                <div className="status-fit-loading">
                  <div className="skeleton" style={{ height: '8px', width: '100%' }}></div>
                </div>
              ) : (
                <>
                  <div className="status-fit-track" aria-hidden="true">
                    <span style={{ width: `${scoreForRing}%` }} />
                  </div>
                  <div className="status-fit-meta">
                    <span>{matchScore === 'N/A' ? 'No score yet' : `${matchScore}% match strength`}</span>
                  </div>
                </>
              )}

              {aiMatchError && !aiMatchLoading && (
                <p className="status-fit-error">{aiMatchError}</p>
              )}

              <div className="fit-signal-list">
                {fitSignalItems.map((item) => (
                  <div key={item.label} className="fit-signal-row">
                    <div className="fit-signal-meta">
                      <span>{item.label}</span>
                      <strong>{item.value}</strong>
                    </div>
                    <div className="fit-signal-track" aria-hidden="true">
                      <span style={{ width: `${item.fill}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            </section>
          </aside>
        </div>
      </aside>
    </div>
  )
}

export default JobSidebar
