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
  { id: 'overview', label: 'Overview' },
  { id: 'match', label: 'Resume match' },
  { id: 'resume', label: 'Resume draft' },
  { id: 'data', label: 'Raw data' },
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

  useEffect(() => {
    if (!job) return undefined

    setActiveTab('overview')
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
  }, [job])

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
  }, [job])

  if (!job) return null

  const currentStatus = normalizeStatus(job.Status)
  const sourceLabel = getSourceLabel(job)
  const matchedSkills = getMatchedSkills(job, 12)
  const matchScore = editedData.ats_score !== 'N/A' ? Number(editedData.ats_score) || 0 : 'N/A'
  const scoreForRing = typeof matchScore === 'number' ? Math.max(0, Math.min(matchScore, 100)) : 0
  const companyMonogram = getCompanyMonogram(job.Company)
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
      setResumeHistory((current) => {
        const latest = response.data?.job?.['Resume Path']
        const version = response.data?.resume_version
        if (!latest || !version) return current
        const filename = latest.split('/').pop() || 'resume.pdf'
        const nextEntry = {
          id: `local-${version}-${filename}`,
          version,
          pdf_path: latest,
          filename,
          download_url: response.data?.pdf_url || `${API_URL}/api/download-resume/${filename}`,
          created_at: new Date().toISOString(),
        }
        return [nextEntry, ...current.filter((entry) => entry.version !== version)]
      })
    } catch (error) {
      console.error('Generate resume error:', error)
      setGenerateError(
        `Resume generation failed: ${error?.response?.data?.detail || error.message || 'Unknown error.'}`,
      )
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
            <div className="job-detail-nav">
              <button type="button" className="detail-nav-button" onClick={onPrev} disabled={!hasPrev}>
                Prev
              </button>
              <button type="button" className="detail-nav-button" onClick={onNext} disabled={!hasNext}>
                Next
              </button>
            </div>

            <div className="job-detail-avatar">{companyMonogram}</div>

            <div className="job-detail-heading-copy">
              <span className="job-detail-kicker">{sourceLabel} role</span>
              <h2>{job.Title || 'Untitled role'}</h2>
              <p>
                <strong>{job.Company || 'Unknown company'}</strong>
                <span>{editedData.location || job.Location || 'Remote / flexible'}</span>
              </p>
            </div>
          </div>

          <div className="job-detail-actions">
            <button
              type="button"
              className={`detail-chip ${isSpecialInterest ? 'active' : ''}`}
              onClick={handleToggleSpecialInterest}
            >
              {isSpecialInterest ? 'Priority role' : 'Mark priority'}
            </button>

            {editMode ? (
              <>
                <button type="button" className="detail-button subtle" onClick={handleJsonToggle}>
                  {jsonMode ? 'Structured editor' : 'Raw JSON'}
                </button>
                {!jsonMode && (
                  <button
                    type="button"
                    className="detail-button accent"
                    onClick={handleAutoTailor}
                    disabled={tailoring}
                  >
                    {tailoring ? 'Tailoring...' : 'AI tailor'}
                  </button>
                )}
                <button
                  type="button"
                  className="detail-button subtle"
                  onClick={handleCancel}
                  disabled={saving}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="detail-button primary"
                  onClick={handleSave}
                  disabled={saving}
                >
                  {saving ? 'Saving...' : 'Save changes'}
                </button>
              </>
            ) : (
              <>
                <a
                  href={job.Link || '#'}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="detail-button subtle"
                >
                  Open role
                </a>
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
        </header>

        <section className="job-detail-meta-strip">
          <article className="detail-stat">
            <span>Match score</span>
            <strong>{matchScore === 'N/A' ? 'N/A' : `${matchScore}%`}</strong>
          </article>
          <article className="detail-stat">
            <span>Stage</span>
            <strong>{STATUS_OPTIONS.find((option) => option.value === currentStatus)?.label || 'Saved'}</strong>
          </article>
          <article className="detail-stat">
            <span>Saved on</span>
            <strong>{formatDisplayDate(job['Date Found'])}</strong>
          </article>
          <article className="detail-stat">
            <span>Search lane</span>
            <strong>{job['Search Query'] || 'Imported opportunity'}</strong>
          </article>
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
              <div className="workspace-stack">
                <section className="workspace-section">
                  <div className="section-topline">
                    <div>
                      <p className="section-kicker">Role summary</p>
                      <h3>Overview</h3>
                    </div>
                    {job.Tier && <span className="tier-badge">{job.Tier}</span>}
                  </div>

                  <div className="snapshot-grid">
                    {summaryItems.map((item) => (
                      <div key={item.label} className="snapshot-card">
                        <span>{item.label}</span>
                        <strong>{item.value}</strong>
                      </div>
                    ))}
                  </div>
                </section>

                <section className="workspace-section">
                  <div className="section-topline">
                    <div>
                      <p className="section-kicker">Fit signals</p>
                      <h3>Matched skills</h3>
                    </div>
                    <span className="section-caption">{matchedSkills.length} captured</span>
                  </div>

                  {fitBreakdownItems.length > 0 && (
                    <div className="snapshot-grid">
                      {fitBreakdownItems.map((item) => (
                        <div key={item.label} className="snapshot-card">
                          <span>{item.label} fit</span>
                          <strong>{item.value}%</strong>
                        </div>
                      ))}
                    </div>
                  )}

                  {job['Industry Fit'] && (
                    <p className="empty-copy">
                      <strong>{job['Industry Fit']}.</strong> {(job['Fit Reasons'] || []).join(' ')}
                    </p>
                  )}

                  {(aiMatch.summary || aiMatchLoading || aiMatchError) && (
                    <div className="snapshot-card">
                      <span>AI match read</span>
                      <strong>
                        {aiMatchLoading
                          ? 'Reviewing fit...'
                          : aiMatch.summary || 'AI match summary unavailable'}
                      </strong>
                      {!aiMatchLoading && aiMatch.score !== null && (
                        <p className="empty-copy">
                          {aiMatch.score}% confidence fit
                          {aiMatch.confidence ? ` • ${aiMatch.confidence} confidence` : ''}
                        </p>
                      )}
                      {!aiMatchLoading && aiMatch.reasons?.length > 0 && (
                        <p className="empty-copy">{aiMatch.reasons.join(' ')}</p>
                      )}
                      {aiMatchError && <p className="empty-copy">{aiMatchError}</p>}
                    </div>
                  )}

                  {matchedSkills.length > 0 ? (
                    <div className="skill-pill-row">
                      {matchedSkills.map((skill) => (
                        <span key={skill} className="skill-pill">
                          {skill}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <p className="empty-copy">
                      No matched skills were captured yet for this role. Use AI tailoring or edit the
                      match workspace to refine the fit.
                    </p>
                  )}
                </section>

                <section className="workspace-section">
                  <div className="section-topline">
                    <div>
                      <p className="section-kicker">Job posting</p>
                      <h3>Original description</h3>
                    </div>
                    <button
                      type="button"
                      className="mini-action"
                      onClick={() => copyText(job['Job Description'] || '', setSaveMessage)}
                    >
                      Copy text
                    </button>
                  </div>

                  <div className="job-description-panel">
                    {job['Job Description'] || 'No job description has been saved for this role yet.'}
                  </div>
                </section>
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
                          className="score-ring"
                          style={{ '--score-progress': `${scoreForRing}%` }}
                        >
                          <span>{matchScore === 'N/A' ? 'N/A' : `${matchScore}%`}</span>
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
            <section className="workspace-section rail-card">
              <div className="section-topline">
                <div>
                  <p className="section-kicker">Pipeline</p>
                  <h3>Application status</h3>
                </div>
              </div>

              <select
                className="rail-select"
                value={currentStatus}
                onChange={(event) => onStatusChange(job, event.target.value)}
              >
                {STATUS_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>

              <div className="status-timeline">
                {STATUS_TIMELINE.map((step) => (
                  <div
                    key={step.value}
                    className={`timeline-step ${getTimelineState(currentStatus, step.value)}`}
                  >
                    <span className="timeline-dot" />
                    <div className="timeline-copy">
                      <strong>{step.label}</strong>
                      <p>{step.hint}</p>
                    </div>
                  </div>
                ))}
              </div>

              {(statusEvents.length > 0 || eventsError) && (
                <div className="timeline-history">
                  <p className="section-kicker">Recent updates</p>
                  {eventsError && <p className="inline-note">{eventsError}</p>}
                  {statusEvents.slice(0, 4).map((event) => (
                    <div key={event.id} className="timeline-history-item">
                      <strong>
                        {(event.old_status || 'saved').replaceAll('_', ' ')} to {(event.new_status || 'saved').replaceAll('_', ' ')}
                      </strong>
                      <p>{formatDisplayDate(event.created_at)}</p>
                    </div>
                  ))}
                </div>
              )}
            </section>

            <section className="workspace-section rail-card">
              <div className="section-topline">
                <div>
                  <p className="section-kicker">Research</p>
                  <h3>Notes</h3>
                </div>
                <button
                  type="button"
                  className="mini-action"
                  onClick={handleSaveNotes}
                  disabled={notesSaving}
                >
                  {notesSaving ? 'Saving...' : 'Save'}
                </button>
              </div>

              {notesError && <p className="inline-note">{notesError}</p>}

              <textarea
                className="rail-notes"
                value={notesText}
                onChange={(event) => setNotesText(event.target.value)}
                placeholder="Capture recruiter names, interview prep, deadlines, or company research."
              />
            </section>

            <section className="workspace-section rail-card">
              <div className="section-topline">
                <div>
                  <p className="section-kicker">Shortcuts</p>
                  <h3>Quick actions</h3>
                </div>
              </div>

              <div className="rail-actions">
                <button
                  type="button"
                  className="rail-action primary"
                  onClick={() => onStatusChange(job, 'applied')}
                >
                  Mark applied
                </button>
                <button
                  type="button"
                  className="rail-action"
                  onClick={() => onStatusChange(job, 'interviewing')}
                >
                  Move to interviewing
                </button>
                <button
                  type="button"
                  className="rail-action"
                  onClick={handleGenerateResume}
                  disabled={generating}
                >
                  {generating ? 'Generating PDF...' : 'Generate resume PDF'}
                </button>
                <button
                  type="button"
                  className="rail-action"
                  onClick={handleAutoTailor}
                  disabled={tailoring}
                >
                  {tailoring ? 'Refreshing...' : 'Refresh AI suggestions'}
                </button>
                <button
                  type="button"
                  className="rail-action danger"
                  onClick={() => onStatusChange(job, 'skipped')}
                >
                  Archive role
                </button>
              </div>
            </section>
          </aside>
        </div>
      </aside>
    </div>
  )
}

export default JobSidebar
