import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import JobCard from '../components/JobCard'
import { formatCompactDate, getDisplayMatchScore, getJobId, getSourceLabel, normalizeStatus } from '../lib/jobs'
import './AllJobs.css'

const FILTERS = ['Remote', 'Hybrid', 'On-site', 'Entry', 'Mid', 'Senior']
const DETAIL_TABS = ['Job Description', 'Company', 'My Notes']

const ROLE_OPTIONS = ['Any', 'Engineer', 'Designer', 'Product', 'Data', 'Research']
const SALARY_OPTIONS = [
  { label: 'Any', min: 0 },
  { label: '$60k+', min: 60000 },
  { label: '$90k+', min: 90000 },
  { label: '$120k+', min: 120000 },
  { label: '$150k+', min: 150000 },
]
const EXPERIENCE_OPTIONS = ['Any', 'Entry', 'Mid', 'Senior', 'Lead']
const SORT_OPTIONS = [
  { key: 'relevance', label: 'Relevant' },
  { key: 'newest', label: 'Newest' },
  { key: 'score', label: 'Score' },
  { key: 'company', label: 'Company A-Z' },
]

function parseSalaryMin(job) {
  const raw = String(job.Salary || job.salary || job.Compensation || '')
  const nums = raw.replace(/,/g, '').match(/\d+/g)
  if (!nums) return null
  const n = parseInt(nums[0], 10)
  return raw.toLowerCase().includes('k') ? n * 1000 : n
}

function FilterDropdown({ label, value, options, onChange, renderOption }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  useEffect(() => {
    const onDoc = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [])
  const display = value && value !== 'Any' ? `${label}: ${value}` : label
  return (
    <div ref={ref} className="filter-chip-wrap" style={{ position: 'relative', display: 'inline-block' }}>
      <button
        type="button"
        className={`filter-chip${value && value !== 'Any' ? ' active' : ''}`}
        onClick={() => setOpen((o) => !o)}
      >
        {display}
        <svg viewBox="0 0 24 24"><path d="M6 9l6 6 6-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
      </button>
      {open && (
        <div className="filter-dropdown-menu" style={{ position: 'absolute', top: '100%', left: 0, marginTop: 4, background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, padding: 4, minWidth: 140, zIndex: 20, boxShadow: '0 6px 16px rgba(15,23,42,0.08)' }}>
          {options.map((opt) => {
            const label = renderOption ? renderOption(opt) : opt
            const val = renderOption ? opt.label : opt
            return (
              <button
                key={val}
                type="button"
                onClick={() => { onChange(val); setOpen(false) }}
                style={{ display: 'block', width: '100%', textAlign: 'left', padding: '6px 10px', border: 0, background: value === val ? '#eef2ff' : 'transparent', borderRadius: 6, cursor: 'pointer', fontSize: 13 }}
              >
                {label}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

function jobMatchesFilter(job, filter) {
  const text = [job.Title, job.Company, job.Location, job['Job Type'], job['Matched Skills'], job['Search Query']]
    .join(' ')
    .toLowerCase()
  return text.includes(filter.toLowerCase())
}

function getSkills(job, limit = 8) {
  return String(job['Matched Skills'] || job['Tech Stack'] || job.skills || '')
    .split(/[,|]/)
    .map((skill) => skill.trim())
    .filter(Boolean)
    .slice(0, limit)
}

function getDescription(job) {
  return (
    job.Description ||
    job.description ||
    job['Job Description'] ||
    'This matched role is ready for review. Open the original posting to confirm responsibilities, requirements, and application details before applying.'
  )
}

function getSalary(job) {
  return job.Salary || job.salary || job.Compensation || ''
}

function getStatusLabel(job) {
  const status = normalizeStatus(job.Status)
  if (status === 'applied') return 'Applied'
  if (status === 'interviewing') return 'Interviewing'
  if (status === 'accepted') return 'Offer'
  if (status === 'skipped') return 'Archived'
  return 'Saved'
}

function getApplyUrl(job) {
  return job.Link || job.URL || job.url || job['Job URL'] || ''
}

/** Returns up to 3 tight scannable fit bullets — short format */
function getFitBullets(job) {
  const skills = getSkills(job, 4)
  const score  = getDisplayMatchScore(job)
  const bullets = []

  if (skills.length > 0) {
    // "Skills: AWS, LangChain, collaboration" — not "Skills match:"
    bullets.push(`Skills: ${skills.slice(0, 3).map(s => s.toUpperCase().length <= 4 ? s.toUpperCase() : s).join(', ')}`)
  }
  if (job.Location) {
    const loc = job.Location.toLowerCase()
    bullets.push(loc.includes('remote') ? 'Location: Remote-friendly role' : `Location: ${job.Location}`)
  }
  const scoreLabel = score >= 90
    ? 'Relevance: Ranked as top fit for your profile'
    : score >= 70
      ? 'Relevance: Strong — a few gaps worth reviewing'
      : 'Relevance: Possible fit — review before applying'
  bullets.push(scoreLabel)

  return bullets.slice(0, 3)
}

/** Returns 1-2 gap hints to drive AI Tailor action */
function getGapHints(job) {
  const score = getDisplayMatchScore(job)
  const gaps  = []
  if (score < 90) gaps.push('Consider highlighting relevant project experience')
  if (score < 80) gaps.push('Tailor your resume to emphasise matching keywords')
  return gaps.slice(0, 2)
}

/** Human-readable confidence label — precise, not overconfident */
function getConfidenceLabel(score) {
  if (score >= 90) return { label: 'Strong fit', cls: 'conf-high' }
  if (score >= 70) return { label: 'Likely match', cls: 'conf-med' }
  return { label: 'Possible match', cls: 'conf-low' }
}

function companyInitial(company) {
  return (company || 'J').trim().charAt(0).toUpperCase()
}

function NotesEditor({ job, onNotesChange }) {
  const [value, setValue] = useState(job.notes || '')
  const [savedValue, setSavedValue] = useState(job.notes || '')
  useEffect(() => {
    setValue(job.notes || '')
    setSavedValue(job.notes || '')
  }, [job.id])
  const dirty = value !== savedValue
  const save = () => {
    if (!dirty) return
    onNotesChange?.(job, value)
    setSavedValue(value)
  }
  return (
    <div>
      <textarea
        className="detail-notes"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={save}
        onKeyDown={(e) => { if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') save() }}
        placeholder="Add why this job is interesting, what to tailor, or what to verify before applying."
      />
      <div style={{ marginTop: 6, fontSize: 12, color: dirty ? '#b45309' : '#64748b' }}>
        {dirty ? 'Unsaved — click out or press ⌘/Ctrl+Enter to save' : 'Saved'}
      </div>
    </div>
  )
}

function DetailPanel({ job, onStatusChange, onNotesChange, onTailor }) {
  const [activeTab, setActiveTab] = useState(DETAIL_TABS[0])
  const score      = getDisplayMatchScore(job)
  const skills     = getSkills(job)
  const applyUrl   = getApplyUrl(job)
  const salary     = getSalary(job)
  const source     = getSourceLabel(job)
  const posted     = formatCompactDate(job['Date Found'])
  const fitBullets = getFitBullets(job)
  const gapHints   = getGapHints(job)
  const confidence = getConfidenceLabel(score)
  const jobType    = job['Job Type'] || job.remote || 'Full-time'

  // Meta string: Location · Job Type · Source · Posted
  const metaParts = [
    job.Location,
    jobType,
    source,
    posted ? `Posted ${posted}` : null,
  ].filter(Boolean)

  return (
    <article className="alljobs-detail">

      {/* ── Scrollable body ── */}
      <div className="detail-scroll-body">

        {/* ── Company row ── */}
        <div className="detail-company-row">
          <span className="detail-logo">{companyInitial(job.Company)}</span>
          <div className="detail-company-info">
            <span className="detail-company-name">{job.Company || 'Unknown company'}</span>
            {source && <span className="detail-source-badge">{source}</span>}
          </div>
          <span className={`detail-confidence ${confidence.cls}`}>{confidence.label}</span>
        </div>

        {/* ── Job title ── */}
        <h2 className="detail-job-title">{job.Title || 'Untitled role'}</h2>

        {/* ── Trust row — legitimacy signals, not AI confidence ── */}
        <div className="detail-trust-row">
          {source && (
            <span className="detail-trust-item">
              <svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="6" /><path d="M5.5 8l2 2 3-3" /></svg>
              via {source}
            </span>
          )}
          {jobType && <span className="detail-trust-item">{jobType}</span>}
          {job.Location?.toLowerCase().includes('remote') && (
            <span className="detail-trust-item">Remote eligible</span>
          )}
          {posted && <span className="detail-trust-item">Posted {posted}</span>}
        </div>

        {/* ── Decision trigger — understated, trust-first ── */}
        {score >= 70 && (
          <div className="detail-decision-trigger">
            {score >= 90
              ? '✔️ Strong fit — you meet key requirements'
              : '✔️ Likely match based on your profile'}
          </div>
        )}

        {/* ── Meta row ── */}
        <p className="detail-meta-text">
          {metaParts.map((part, i) => (
            <span key={i}>
              {i > 0 && <span className="detail-sep">·</span>}
              {part}
            </span>
          ))}
          {salary && <><span className="detail-sep">·</span><span className="detail-salary">{salary}</span></>}
        </p>

        {/* ── Status badge + posted urgency ── */}
        <div className="detail-status-row">
          <span className={`detail-status-pill dp-${normalizeStatus(job.Status)}`}>
            {getStatusLabel(job)}
          </span>
          {posted && (
            <span className="detail-urgency">🕐 Posted {posted}</span>
          )}
        </div>

        {/* ── Segmented Tabs ── */}
        <nav className="detail-tabs" aria-label="Job detail sections">
          {DETAIL_TABS.map((tab) => (
            <button
              key={tab}
              type="button"
              className={activeTab === tab ? 'active' : ''}
              onClick={() => setActiveTab(tab)}
            >
              {tab}
            </button>
          ))}
        </nav>

        {/* ── Tab: Job Description ── */}
        {activeTab === 'Job Description' && (
          <div className="detail-body">

            {/* Why you're a strong fit */}
            <section className="detail-fit-card">
              <span className="detail-section-label">Profile fit</span>
              <h3 className="detail-fit-title">Why you're a strong fit</h3>
              <ul className="detail-fit-list">
                {fitBullets.map((b) => <li key={b}>{b}</li>)}
              </ul>
            </section>

            {/* Improve your chances — standalone amber section */}
            {gapHints.length > 0 && (
              <section className="detail-improve-section">
                <span className="detail-section-label">Improve your chances</span>
                <ul className="detail-improve-list">
                  {gapHints.map((g) => <li key={g}>{g}</li>)}
                </ul>
              </section>
            )}

            {/* Matched skills */}
            {skills.length > 0 && (
              <section className="detail-section">
                <span className="detail-section-label">Matched skills</span>
                <div className="detail-skill-grid">
                  {skills.map((skill) => <span key={skill}>{skill}</span>)}
                </div>
              </section>
            )}

            {/* About the role */}
            <section className="detail-section">
              <span className="detail-section-label">About the role</span>
              <p className="detail-description">{getDescription(job)}</p>
            </section>
          </div>
        )}

        {activeTab === 'Company' && (
          <div className="detail-body">
            <section className="detail-section">
              <span className="detail-section-label">Company</span>
              <h3>{job.Company || 'Unknown company'}</h3>
              <p className="detail-description">
                Review the company, team, and posting source before applying.
              </p>
            </section>
            <section className="detail-section detail-facts">
              <span><strong>Source</strong>{source || 'Matched feed'}</span>
              <span><strong>Location</strong>{job.Location || 'Not listed'}</span>
              <span><strong>Status</strong>{getStatusLabel(job)}</span>
            </section>
          </div>
        )}

        {activeTab === 'My Notes' && (
          <div className="detail-body">
            <section className="detail-section">
              <span className="detail-section-label">Application notes</span>
              <NotesEditor job={job} onNotesChange={onNotesChange} />
            </section>
          </div>
        )}

      </div>{/* end scroll body */}

      {/* ── Sticky Apply Bar ── */}
      <div className="detail-sticky-bar">
        {applyUrl ? (
          <a className="detail-apply" href={applyUrl} target="_blank" rel="noreferrer">
            Apply on Company Site
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 17 17 7M9 7h8v8" /></svg>
          </a>
        ) : (
          <button type="button" className="detail-apply" disabled>No apply link yet</button>
        )}
        <div className="detail-tailor-col">
          <button type="button" className="detail-tailor" onClick={() => onTailor?.(job)}>
            ✨ Tailor Resume
          </button>
          <p className="detail-tailor-hint">Highlights skills · Reorders projects · Adapts summary</p>
        </div>
      </div>

    </article>
  )
}

const AllJobs = ({ jobs, onStatusChange, onNotesChange, onTailor }) => {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [selectedJobId, setSelectedJobId]   = useState('')
  const [searchQuery, setSearchQuery]       = useState(() => searchParams.get('q') || '')
  const [activeFilters, setActiveFilters]   = useState(['Remote'])
  const [roleFilter, setRoleFilter]         = useState('Any')
  const [salaryFilter, setSalaryFilter]     = useState('Any')
  const [experienceFilter, setExperienceFilter] = useState('Any')
  const [sortKey, setSortKey]               = useState('relevance')
  const [panelWidth, setPanelWidth]         = useState(780)   // open at max — users can drag left to shrink
  const isDragging                          = useRef(false)
  const startX                              = useRef(0)
  const startWidth                          = useRef(0)

  const onDragStart = useCallback((e) => {
    isDragging.current = true
    startX.current     = e.clientX
    startWidth.current = panelWidth
    document.body.style.cursor    = 'col-resize'
    document.body.style.userSelect = 'none'

    const onMove = (moveEvent) => {
      if (!isDragging.current) return
      const delta   = startX.current - moveEvent.clientX   // drag left = wider
      const next    = Math.min(Math.max(startWidth.current + delta, 320), 780)
      setPanelWidth(next)
    }
    const onUp = () => {
      isDragging.current            = false
      document.body.style.cursor    = ''
      document.body.style.userSelect = ''
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup',   onUp)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup',   onUp)
  }, [panelWidth])

  const filteredJobs = useMemo(() => {
    const salaryMin = SALARY_OPTIONS.find((s) => s.label === salaryFilter)?.min || 0
    const list = jobs.filter((job) => {
      const search = searchQuery.trim().toLowerCase()
      if (search) {
        const haystack = [job.Title, job.Company, job.Location, job['Matched Skills'], job['Search Query']]
          .join(' ')
          .toLowerCase()
        if (!haystack.includes(search)) return false
      }

      if (activeFilters.length > 0 && !activeFilters.some((filter) => jobMatchesFilter(job, filter))) {
        return false
      }

      if (roleFilter !== 'Any') {
        const hay = `${job.Title || ''} ${job['Search Query'] || ''}`.toLowerCase()
        if (!hay.includes(roleFilter.toLowerCase())) return false
      }

      if (experienceFilter !== 'Any') {
        const hay = `${job.Title || ''} ${job['Job Type'] || ''}`.toLowerCase()
        if (!hay.includes(experienceFilter.toLowerCase())) return false
      }

      if (salaryMin > 0) {
        const jobSalary = parseSalaryMin(job)
        if (jobSalary === null || jobSalary < salaryMin) return false
      }

      return true
    })

    const sorted = [...list]
    if (sortKey === 'newest') {
      sorted.sort((a, b) => new Date(b['Date Found'] || 0) - new Date(a['Date Found'] || 0))
    } else if (sortKey === 'company') {
      sorted.sort((a, b) => String(a.Company || '').localeCompare(String(b.Company || '')))
    } else {
      sorted.sort((a, b) => getDisplayMatchScore(b) - getDisplayMatchScore(a))
    }
    return sorted
  }, [activeFilters, jobs, searchQuery, roleFilter, salaryFilter, experienceFilter, sortKey])

  const selectedJob = useMemo(() => {
    if (filteredJobs.length === 0) return null
    return filteredJobs.find((job) => getJobId(job) === selectedJobId) || filteredJobs[0]
  }, [filteredJobs, selectedJobId])

  const topMatch = filteredJobs[0] ? getDisplayMatchScore(filteredJobs[0]) : 0

  const toggleFilter = (filter) => {
    setActiveFilters((current) =>
      current.includes(filter) ? current.filter((item) => item !== filter) : [...current, filter],
    )
  }

  return (
    <section className="alljobs-page">
      <header className="alljobs-header">
        {/* Layer 1 — Title + subtitle */}
        <div className="alljobs-title-block">
          <h1>Discover Jobs</h1>
          <p className="alljobs-subtitle">
            <strong>{filteredJobs.length.toLocaleString()}</strong> roles matching "{searchQuery || 'Product Designer'}"
          </p>
        </div>

        {/* Layer 2 — Controls: search · filter cluster · right actions */}
        <div className="alljobs-toolbar">
          {/* Search — dominant, ~60% width */}
          <label className="alljobs-search" htmlFor="job-search">
            <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" /></svg>
            <input
              id="job-search"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Job title, keywords, or company…"
            />
          </label>

          {/* Filter cluster — grouped pill container */}
          <div className="alljobs-filter-cluster">
            <FilterDropdown label="Role" value={roleFilter} options={ROLE_OPTIONS} onChange={setRoleFilter} />
            <button type="button" className={`filter-chip${activeFilters.includes('Remote') ? ' active' : ''}`} onClick={() => toggleFilter('Remote')}>
              Location: Remote
              {activeFilters.includes('Remote') && <span className="remove-filter" onClick={(e) => { e.stopPropagation(); toggleFilter('Remote') }}>×</span>}
            </button>
            <FilterDropdown label="Salary" value={salaryFilter} options={SALARY_OPTIONS} onChange={setSalaryFilter} renderOption={(o) => o.label} />
            <FilterDropdown label="Experience" value={experienceFilter} options={EXPERIENCE_OPTIONS} onChange={setExperienceFilter} />
          </div>

          {/* Right-side actions */}
          <div className="alljobs-toolbar-actions">
            <button type="button" className="toolbar-more-btn">
              <svg viewBox="0 0 24 24"><path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
              More
            </button>
            <div className="toolbar-divider" aria-hidden="true" />
            <div className="alljobs-sort">
              <span className="sort-label">Sort:</span>
              <select
                className="sort-dropdown"
                value={sortKey}
                onChange={(e) => setSortKey(e.target.value)}
                style={{ padding: '6px 10px', borderRadius: 8, border: '1px solid #e2e8f0', background: '#fff', fontSize: 13, cursor: 'pointer' }}
              >
                {SORT_OPTIONS.map((opt) => (
                  <option key={opt.key} value={opt.key}>{opt.label}</option>
                ))}
              </select>
            </div>
            <button
              type="button"
              className="toolbar-secondary-btn"
              onClick={() => {
                if (!searchQuery.trim()) return
                try {
                  const saved = JSON.parse(localStorage.getItem('savedSearches') || '[]')
                  const entry = { query: searchQuery.trim(), filters: { activeFilters, roleFilter, salaryFilter, experienceFilter, sortKey }, savedAt: new Date().toISOString() }
                  saved.unshift(entry)
                  localStorage.setItem('savedSearches', JSON.stringify(saved.slice(0, 20)))
                } catch {}
              }}
            >
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
              Save Search
            </button>
          </div>
        </div>
      </header>

      <div className="alljobs-workspace">
        <div className="alljobs-results-column">
          {filteredJobs.length === 0 ? (
            <div className="empty-state">
              <h2>No matching jobs</h2>
              <p>Try removing a filter or changing the search text.</p>
            </div>
          ) : (
            filteredJobs.map((job) => {
              const selected = selectedJob && getJobId(job) === getJobId(selectedJob)
              return (
                <JobCard
                  key={getJobId(job)}
                  job={job}
                  selected={selected}
                  onClick={(nextJob) => setSelectedJobId(getJobId(nextJob))}
                />
              )
            })
          )}
        </div>

        <div
          className="alljobs-resize-handle"
          onMouseDown={onDragStart}
          role="separator"
          aria-label="Drag to resize detail panel"
          aria-orientation="vertical"
        />
        <aside className="alljobs-detail-panel" style={{ width: panelWidth, minWidth: panelWidth, maxWidth: panelWidth }}>
          {selectedJob ? (
            <DetailPanel job={selectedJob} onStatusChange={onStatusChange} onNotesChange={onNotesChange} onTailor={onTailor} />
          ) : (
            <div className="alljobs-detail-empty">
              <h2>Select a matched job</h2>
              <p>Your fit analysis, job description, and application actions will appear here.</p>
            </div>
          )}
        </aside>
      </div>
    </section>
  )
}

export default AllJobs
