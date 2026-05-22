import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import JobSidebar from '../components/JobSidebar'
import { getJobId, normalizeStatus, formatDisplayDate, getDisplayMatchScore, getTierVariant } from '../lib/jobs'
import './SavedJobs.css'

const PAGE_SIZE = 10

function nextStepFor(job) {
  const hasTailored = (job['Analysis Data']?.points?.length > 0)
  if (hasTailored) return 'Resume tailored ✓'
  return 'Tailor resume →'
}

function hasContactInfo(job) {
  const contact = job?.['Contact Info']
  if (!contact || typeof contact !== 'object') return false
  return Boolean(contact.name || contact.email || contact.phone)
}

function getContactInfo(job) {
  const contact = job?.['Contact Info']
  return contact && typeof contact === 'object' ? contact : {}
}

function cleanContactRaw(raw) {
  return String(raw || '')
    .split(/\n+/)
    .map((line) => line.trim())
    .filter((line) => line && !/^(contact the job poster|view profile)$/i.test(line))
    .join('\n')
}

function contactText(contact) {
  const raw = cleanContactRaw(contact.raw)
  return [
    contact.name && `Name: ${contact.name}`,
    contact.title && `Title: ${contact.title}`,
    contact.company && `Company: ${contact.company}`,
    contact.email && `Email: ${contact.email}`,
    contact.phone && `Phone: ${contact.phone}`,
    raw && `Raw:\n${raw}`,
  ].filter(Boolean).join('\n')
}

function isDiceJob(job) {
  return String(job?.Source || '').trim().toLowerCase() === 'dice'
}

function SavedJobs({ jobs, session, onStatusChange, onDelete }) {
  const navigate = useNavigate()
  const [selectedJob, setSelectedJob] = useState(null)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [quickFilter, setQuickFilter] = useState('all')
  const [currentPage, setCurrentPage] = useState(1)
  const [copiedContactId, setCopiedContactId] = useState('')

  const savedJobs = useMemo(
    () =>
      jobs
        .filter((job) => normalizeStatus(job.Status) === 'not_applied')
        .sort((left, right) => new Date(right['Date Found'] || 0) - new Date(left['Date Found'] || 0)),
    [jobs],
  )

  const filteredJobs = useMemo(() => {
    return savedJobs.filter((job) => {
      if (quickFilter === 'dice' && !isDiceJob(job)) return false
      if (quickFilter === 'contact' && !hasContactInfo(job)) return false
      if (search.trim()) {
        const contact = job['Contact Info'] || {}
        const hay = [job.Title, job.Company, job.Location, job.Source, contact.name, contact.company, contact.email, contact.phone]
          .join(' ')
          .toLowerCase()
        if (!hay.includes(search.trim().toLowerCase())) return false
      }
      return true
    })
  }, [savedJobs, search, quickFilter])

  const filterCounts = useMemo(() => ({
    all: savedJobs.length,
    dice: savedJobs.filter(isDiceJob).length,
    contact: savedJobs.filter(hasContactInfo).length,
  }), [savedJobs])

  const totalPages = Math.max(1, Math.ceil(filteredJobs.length / PAGE_SIZE))
  const safePage = Math.min(currentPage, totalPages)
  const pagedJobs = filteredJobs.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE)

  const firstName = (session?.full_name || session?.username || '').split(' ')[0] || 'there'

  const selectedIndex = selectedJob
    ? filteredJobs.findIndex((job) => getJobId(job) === getJobId(selectedJob))
    : -1
  const hasPrev = selectedIndex > 0
  const hasNext = selectedIndex !== -1 && selectedIndex < filteredJobs.length - 1

  const copyContact = async (event, job) => {
    event.stopPropagation()
    const text = contactText(getContactInfo(job))
    if (!text) return
    await navigator.clipboard.writeText(text).catch(() => {})
    const id = getJobId(job)
    setCopiedContactId(id)
    window.setTimeout(() => setCopiedContactId((current) => current === id ? '' : current), 1800)
  }

  return (
    <section className="saved-page">
      <div className="saved-layout">
        <div className="saved-main">
          <header className="saved-header">
            <div>
              <h1>Saved Jobs</h1>
              <p>Hello <strong>{firstName}</strong>, here are your potential roles.<br />
                <small>Review these opportunities and start your application when ready.</small>
              </p>
            </div>
            <div className="saved-header-actions">
              <button type="button" className="saved-add-btn" onClick={() => navigate('/jobs')}>+ Find More</button>
            </div>
          </header>

          <div className="saved-jobs-container">
            <div className="saved-toolbar">
              <div className="saved-toolbar-copy">
                <strong>{filteredJobs.length} Saved Opportunities</strong>
                <span>{quickFilter === 'dice' ? 'Dice jobs only' : quickFilter === 'contact' ? 'Jobs with recruiter contact info' : 'All saved jobs'}</span>
              </div>
              <div className="saved-filter-tabs" aria-label="Saved job filters">
                {[
                  { key: 'all', label: 'All', count: filterCounts.all },
                  { key: 'dice', label: 'Dice', count: filterCounts.dice },
                  { key: 'contact', label: 'Contact info', count: filterCounts.contact },
                ].map((filter) => (
                  <button
                    key={filter.key}
                    type="button"
                    className={quickFilter === filter.key ? 'active' : ''}
                    onClick={() => { setQuickFilter(filter.key); setCurrentPage(1) }}
                  >
                    {filter.label}
                    <span>{filter.count}</span>
                  </button>
                ))}
              </div>
              <label className="saved-search">
                <svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" /></svg>
                <input placeholder="Filter your saved jobs…" value={search} onChange={(e) => setSearch(e.target.value)} />
              </label>
            </div>

            <div className="saved-table">
              <div className="saved-table-head">
                <span>COMPANY & ROLE</span>
                <span>DATE SAVED</span>
                <span>MATCH QUALITY</span>
                <span>NEXT STEP</span>
                <span style={{ textAlign: 'right' }}>ACTION</span>
              </div>
              
              {filteredJobs.length === 0 ? (
                <div className="saved-empty">
                  {search ? 'No jobs match your filter.' : 'You haven\'t saved any jobs yet. Browse the feed to get started!'}
                </div>
              ) : (
                pagedJobs.map((job) => {
                  const matchScore = getDisplayMatchScore(job)
                  const tierVariant = getTierVariant(job)
                  const contact = getContactInfo(job)
                  const hasContact = hasContactInfo(job)
                  return (
                    <div
                      key={getJobId(job)}
                      role="button"
                      tabIndex={0}
                      className="saved-row"
                      onClick={() => { setSelectedJob(job); setSidebarOpen(true) }}
                      onKeyDown={(e) => e.key === 'Enter' && (setSelectedJob(job), setSidebarOpen(true))}
                    >
                      <div className="saved-position">
                        <span className="saved-logo">{(job.Company || 'J').charAt(0).toUpperCase()}</span>
                        <div>
                          <p>{job.Title || 'Untitled role'}</p>
                          <small>
                            {job.Company || 'Unknown company'}
                            {isDiceJob(job) && <span className="saved-source-chip">Dice</span>}
                            {hasContact && <span className="saved-contact-chip">Contact</span>}
                          </small>
                        </div>
                      </div>
                      <span className="saved-muted">{formatDisplayDate(job['Date Found'])}</span>
                      <span>
                        <span className={`status-pill tier-${tierVariant}`}>
                           {matchScore}% Match
                        </span>
                      </span>
                      <span className="saved-muted">{nextStepFor(job)}</span>
                      <span className="saved-row-actions">
                        <button
                          type="button"
                          className="saved-action"
                          onClick={(e) => { e.stopPropagation(); setSelectedJob(job); setSidebarOpen(true) }}
                        >
                          View →
                        </button>
                        <button
                          type="button"
                          className="saved-delete-btn"
                          title="Remove job"
                          onClick={(e) => { e.stopPropagation(); onDelete && onDelete(job) }}
                        >
                          ✕
                        </button>
                      </span>
                      {hasContact && (
                        <div className="saved-contact-panel" onClick={(event) => event.stopPropagation()}>
                          <div className="saved-contact-heading">
                            <div>
                              <strong>{contact.name || 'Recruiter contact'}</strong>
                              {(contact.title || contact.company) && (
                                <span>{[contact.title, contact.company].filter(Boolean).join(' · ')}</span>
                              )}
                            </div>
                            <button type="button" onClick={(event) => copyContact(event, job)}>
                              {copiedContactId === getJobId(job) ? 'Copied' : 'Copy'}
                            </button>
                          </div>
                          <div className="saved-contact-details">
                            {contact.email && <a href={`mailto:${contact.email}`}>{contact.email}</a>}
                            {contact.phone && <a href={`tel:${contact.phone}`}>{contact.phone}</a>}
                            {contact.company && <span>{contact.company}</span>}
                          </div>
                          {cleanContactRaw(contact.raw) && <pre>{cleanContactRaw(contact.raw)}</pre>}
                        </div>
                      )}
                    </div>
                  )
                })
              )}
            </div>

            {totalPages > 1 && (
              <div className="saved-pagination">
                <span>
                  Showing {(safePage - 1) * PAGE_SIZE + 1} to {Math.min(safePage * PAGE_SIZE, filteredJobs.length)} of {filteredJobs.length}
                </span>
                <div>
                  <button type="button" disabled={safePage <= 1} onClick={() => setCurrentPage(p => p - 1)}>‹</button>
                  {Array.from({ length: totalPages }, (_, i) => (
                    <button 
                      key={i+1} 
                      type="button" 
                      className={safePage === i + 1 ? 'active' : ''}
                      onClick={() => setCurrentPage(i + 1)}
                    >
                      {i + 1}
                    </button>
                  ))}
                  <button type="button" disabled={safePage >= totalPages} onClick={() => setCurrentPage(p => p + 1)}>›</button>
                </div>
              </div>
            )}
          </div>
        </div>

        <aside className="applied-side">
          {/* Reuse sidebar styling from applied-side if needed, or keeping it clean for now */}
          <div className="side-card">
            <div className="side-card-head"><strong>Quick Tips</strong></div>
            <div style={{ fontSize: '0.82rem', color: '#64748b', lineHeight: '1.5', display: 'grid', gap: '0.75rem' }}>
              <p>✨ <strong>Tailor first:</strong> Use our AI Resume Tailor to improve your chances before applying.</p>
              <p>📅 <strong>Don't wait:</strong> Jobs can expire quickly. Aim to apply within 48 hours of saving.</p>
              <p>📊 <strong>Match Quality:</strong> Focus on jobs with 70%+ match scores for the highest ROI.</p>
            </div>
          </div>
        </aside>
      </div>

      {sidebarOpen && selectedJob && (
        <JobSidebar
          job={selectedJob}
          onClose={() => { setSidebarOpen(false); setSelectedJob(null) }}
          onStatusChange={onStatusChange}
          onDelete={onDelete}
          onPrev={() => hasPrev && setSelectedJob(filteredJobs[selectedIndex - 1])}
          onNext={() => hasNext && setSelectedJob(filteredJobs[selectedIndex + 1])}
          hasPrev={hasPrev}
          hasNext={hasNext}
        />
      )}
    </section>
  )
}

export default SavedJobs
