import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import JobSidebar from '../components/JobSidebar'
import { APPLIED_STATUSES, getJobId, normalizeStatus } from '../lib/jobs'
import './AppliedJobs.css'

const PAGE_SIZE = 10

const STATUS_LABELS = {
  applied: 'Applied',
  screening: 'Screening',
  interviewing: 'Interviewing',
  accepted: 'Offer',
  skipped: 'Rejected',
}

const STATUS_CLASSES = {
  applied: 'applied',
  screening: 'applied',
  interviewing: 'interviewing',
  accepted: 'offer',
  skipped: 'rejected',
}

const TABS = ['All', 'Applied', 'Interviewing', 'Offer', 'Rejected']

function stageFor(job) {
  const status = normalizeStatus(job.Status)
  if (status === 'interviewing') return 'interviewing'
  return status
}

function formatDate(date) {
  if (!date) return 'Recently'
  try {
    const d = new Date(date)
    return d.toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' })
  } catch { return 'Recently' }
}

function nextStepFor(job) {
  const status = stageFor(job)
  if (status === 'interviewing') return 'Interview in progress'
  if (status === 'screening') return 'Phone screen scheduled'
  if (status === 'accepted') return 'Review offer'
  if (status === 'skipped') return 'Ask for feedback'
  const hasTailored = (job['Analysis Data']?.points?.length > 0)
  if (hasTailored) return 'Resume tailored ✓'
  return 'Tailor resume →'
}

function StatCard({ icon, iconBg, count, label, tint, onViewDetails }) {
  return (
    <div className="stat-card">
      <span className="stat-icon" style={{ background: iconBg }}>{icon}</span>
      <div>
        <strong className="stat-count">{count}</strong>
        <span className="stat-label">{label}</span>
        <button className="stat-link" type="button" style={{ color: tint }} onClick={onViewDetails}>View details →</button>
      </div>
    </div>
  )
}

function exportCSV(jobs) {
  const headers = ['Company', 'Title', 'Status', 'Date Applied', 'Skill Score']
  const rows = jobs.map((j) => [
    j.Company || '',
    j.Title || '',
    normalizeStatus(j.Status),
    j.applied_at || j.date_applied || '',
    j['Skill Score'] || '',
  ])
  const csv = [headers, ...rows].map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n')
  const blob = new Blob([csv], { type: 'text/csv' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `applications_${new Date().toISOString().slice(0, 10)}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

function getDateRange(jobs) {
  const dates = jobs.map((j) => {
    const d = new Date(j.applied_at || j.date_applied || j['Date Found'])
    return isNaN(d) ? null : d
  }).filter(Boolean)
  if (dates.length === 0) return null
  const min = new Date(Math.min(...dates))
  const max = new Date(Math.max(...dates))
  const fmt = (d) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  return `${fmt(min)} – ${fmt(max)}`
}

function AppliedJobs({ jobs, session, onStatusChange, onDelete }) {
  const navigate = useNavigate()
  const [selectedJob, setSelectedJob] = useState(null)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [activeTab, setActiveTab] = useState('All')
  const [search, setSearch] = useState('')
  const [currentPage, setCurrentPage] = useState(1)

  const appliedJobs = useMemo(
    () =>
      jobs
        .filter((job) => APPLIED_STATUSES.includes(normalizeStatus(job.Status)) || normalizeStatus(job.Status) === 'skipped')
        .sort((left, right) => (right['Skill Score'] || 0) - (left['Skill Score'] || 0)),
    [jobs],
  )

  const counts = useMemo(() => {
    const totals = { applied: 0, interviewing: 0, accepted: 0 }
    for (const job of appliedJobs) {
      const s = stageFor(job)
      if (s === 'applied' || s === 'screening') totals.applied += 1
      else if (s === 'interviewing') totals.interviewing += 1
      else if (s === 'accepted') totals.accepted += 1
    }
    return totals
  }, [appliedJobs])

  const filteredJobs = useMemo(() => {
    return appliedJobs.filter((job) => {
      if (activeTab !== 'All') {
        const stage = stageFor(job)
        const stageLabel = STATUS_LABELS[stage] || 'Applied'
        if (activeTab !== stageLabel && !(activeTab === 'Applied' && (stage === 'applied' || stage === 'screening'))) return false
      }
      if (search.trim()) {
        const hay = [job.Title, job.Company].join(' ').toLowerCase()
        if (!hay.includes(search.trim().toLowerCase())) return false
      }
      return true
    })
  }, [appliedJobs, activeTab, search])

  const totalPages = Math.max(1, Math.ceil(filteredJobs.length / PAGE_SIZE))
  const safePage = Math.min(currentPage, totalPages)
  const pagedJobs = filteredJobs.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE)

  const recentActivity = useMemo(() => {
    return [...appliedJobs]
      .sort((a, b) => new Date(b.applied_at || b.date_applied || b['Date Found'] || 0) - new Date(a.applied_at || a.date_applied || a['Date Found'] || 0))
      .slice(0, 3)
      .map((job) => {
        const stage = stageFor(job)
        const date = job.applied_at || job.date_applied || job['Date Found']
        const timeLabel = date ? new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : 'Recently'
        let label = `Applied to ${job.Company || 'Unknown'}`
        let body = `Submitted application for ${job.Title || 'role'}.`
        if (stage === 'interviewing') { label = `Interview scheduled — ${job.Company}`; body = `Interview round in progress.` }
        if (stage === 'accepted') { label = `Offer received — ${job.Company}`; body = `Review offer details when ready.` }
        return { label, time: timeLabel, body, key: getJobId(job) }
      })
  }, [appliedJobs])

  const dateRange = useMemo(() => getDateRange(appliedJobs), [appliedJobs])

  const selectedIndex = selectedJob
    ? filteredJobs.findIndex((job) => getJobId(job) === getJobId(selectedJob))
    : -1
  const hasPrev = selectedIndex > 0
  const hasNext = selectedIndex !== -1 && selectedIndex < filteredJobs.length - 1

  const firstName = (session?.full_name || session?.username || '').split(' ')[0] || 'there'

  const upcomingInterviews = filteredJobs.filter((j) => stageFor(j) === 'interviewing').slice(0, 2)

  return (
    <section className="applied-page">
      <div className="applied-layout">
        <div className="applied-main">
          <header className="applied-header-v2">
            <div>
              <h1>Applied Jobs</h1>
              <p>Welcome Back, <strong>{firstName}</strong> <span role="img" aria-label="wave">👋</span><br />
                <small>Track your job applications and stay on top of your career goals.</small>
              </p>
            </div>
            <div className="applied-header-actions">
              <button type="button" className="applied-date-btn">
                <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="5" width="16" height="15" rx="2" /><path d="M4 10h16M9 3v4M15 3v4" /></svg>
                {dateRange || 'No applications yet'}
              </button>
              <button type="button" className="applied-add-btn" onClick={() => navigate('/tracker')}>+ Add New</button>
            </div>
          </header>

          <div className="stat-cards">
            <StatCard
              icon={<svg viewBox="0 0 24 24"><path d="M4 12l5 5 11-11" /></svg>}
              iconBg="#eef1ff" tint="#4f46e5"
              count={counts.applied} label="Total Applied"
              onViewDetails={() => { setActiveTab('Applied'); setCurrentPage(1) }}
            />
            <StatCard
              icon={<svg viewBox="0 0 24 24"><path d="M12 8v4l3 2M20 12a8 8 0 1 1-16 0 8 8 0 0 1 16 0z" /></svg>}
              iconBg="#fff1d6" tint="#b45309"
              count={counts.interviewing} label="Interviewing"
              onViewDetails={() => { setActiveTab('Interviewing'); setCurrentPage(1) }}
            />
            <StatCard
              icon={<svg viewBox="0 0 24 24"><path d="M12 2l3.1 6.3 6.9 1-5 4.9 1.2 6.8L12 18l-6.2 3 1.2-6.8-5-4.9 6.9-1z" /></svg>}
              iconBg="#e3f3ea" tint="#059669"
              count={counts.accepted} label="Offers Received"
              onViewDetails={() => { setActiveTab('Offer'); setCurrentPage(1) }}
            />
          </div>

          <div className="applications-history">
            <div className="applications-history-head">
              <div>
                <strong>Application History</strong>
              </div>
              <div className="applications-history-actions">
                <button className="history-btn" type="button" onClick={() => exportCSV(filteredJobs)}>
                  <svg viewBox="0 0 24 24"><path d="M12 3v12m0 0l-4-4m4 4l4-4M5 21h14" /></svg>
                  Export
                </button>
                <button className="history-btn" type="button" onClick={() => {
                  if (selectedJob && sidebarOpen) {
                    // sidebar already open — user can note in sidebar
                  } else if (pagedJobs.length > 0) {
                    setSelectedJob(pagedJobs[0]); setSidebarOpen(true)
                  }
                }}>
                  <svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14" /></svg>
                  Add Note
                </button>
              </div>
            </div>

            <div className="history-toolbar">
              <div className="history-tabs">
                {TABS.map((t) => (
                  <button key={t} type="button" className={activeTab === t ? 'active' : ''} onClick={() => setActiveTab(t)}>
                    {t}
                  </button>
                ))}
              </div>
              <label className="history-search">
                <svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" /></svg>
                <input placeholder="Search applications…" value={search} onChange={(e) => setSearch(e.target.value)} />
              </label>
            </div>

            <div className="applications-table">
              <div className="applications-table-head">
                <span>COMPANY & ROLE</span>
                <span>DATE APPLIED</span>
                <span>STATUS</span>
                <span>NEXT STEP</span>
                <span>ACTIONS</span>
              </div>
              {filteredJobs.length === 0 ? (
                <div className="applications-empty">No applications to show.</div>
              ) : (
                pagedJobs.map((job) => {
                  const stage = stageFor(job)
                  return (
                    <button
                      key={getJobId(job)}
                      type="button"
                      className="application-row"
                      onClick={() => { setSelectedJob(job); setSidebarOpen(true) }}
                    >
                      <div className="application-position">
                        <span className="app-position-logo">{(job.Company || 'J').charAt(0).toUpperCase()}</span>
                        <div>
                          <p>{job.Title || 'Untitled role'}</p>
                          <small>{job.Company || 'Unknown company'}</small>
                        </div>
                      </div>
                      <span className="application-muted">{formatDate(job.applied_at || job.date_applied)}</span>
                      <span>
                        <span className={`status-pill status-${STATUS_CLASSES[stage] || 'applied'}`}>
                          <span className="status-dot" /> {STATUS_LABELS[stage] || 'Applied'}
                        </span>
                      </span>
                      <span className="application-muted">{nextStepFor(job)}</span>
                      <span className="application-action">Open Tracker →</span>
                    </button>
                  )
                })
              )}
            </div>

            <div className="applications-pagination">
              <span>
                Showing {filteredJobs.length === 0 ? 0 : (safePage - 1) * PAGE_SIZE + 1} to {Math.min(safePage * PAGE_SIZE, filteredJobs.length)} of {filteredJobs.length} entries
              </span>
              <div>
                <button type="button" aria-label="Previous" disabled={safePage <= 1} onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}>‹</button>
                {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
                  const pg = i + 1
                  return (
                    <button key={pg} type="button" className={safePage === pg ? 'active' : ''} onClick={() => setCurrentPage(pg)}>{pg}</button>
                  )
                })}
                <button type="button" aria-label="Next" disabled={safePage >= totalPages} onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}>›</button>
              </div>
            </div>
          </div>
        </div>

        <aside className="applied-side">
          <div className="side-card">
            <div className="side-card-head">
              <strong>Upcoming Interviews</strong>
              <div className="side-card-nav">
                <button type="button" aria-label="Previous">‹</button>
                <button type="button" aria-label="Next">›</button>
              </div>
            </div>
            {upcomingInterviews.length === 0 ? (
              <div style={{ padding: '1rem', color: '#64748b', fontSize: 13 }}>No interviews in progress yet.</div>
            ) : (
              upcomingInterviews.map((job) => (
                <div key={getJobId(job)} className="interview-card">
                  <strong>{job.Title} – {job.Company}</strong>
                  <span>Upcoming round</span>
                </div>
              ))
            )}
          </div>

          <div className="side-card">
            <div className="side-card-head"><strong>Recent Activity</strong></div>
            {recentActivity.length === 0 ? (
              <div style={{ padding: '1rem', color: '#64748b', fontSize: 13 }}>No recent applications to show.</div>
            ) : recentActivity.map((a) => (
              <div key={a.key} className="activity-row">
                <span className="activity-dot" />
                <div>
                  <strong>{a.label}</strong>
                  <span className="activity-time">{a.time}</span>
                  <p>{a.body}</p>
                </div>
              </div>
            ))}
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

export default AppliedJobs
