import { useMemo, useState } from 'react'
import JobSidebar from '../components/JobSidebar'
import { APPLIED_STATUSES, getJobId, normalizeStatus } from '../lib/jobs'
import './AppliedJobs.css'

const STAGES = [
  { key: 'applied', label: 'Applied', icon: '◷' },
  { key: 'screening', label: 'Screening', icon: 'ⓘ', aliases: ['screening'] },
  { key: 'interviewing', label: 'Interview', icon: '✓' },
  { key: 'accepted', label: 'Offer', icon: '✓' },
  { key: 'skipped', label: 'Rejected', icon: '×' },
]

const STATUS_LABELS = {
  applied: 'Applied',
  screening: 'Screening',
  interviewing: 'Interview',
  accepted: 'Offer',
  skipped: 'Rejected',
}

function stageFor(job) {
  const status = normalizeStatus(job.Status)
  if (status === 'interviewing') return 'interviewing'
  return status
}

function nextActionFor(job) {
  const status = stageFor(job)
  if (status === 'interviewing') return 'Final round - Apr 15'
  if (status === 'screening') return 'Phone screen - Apr 14'
  if (status === 'accepted') return 'Offer expires Apr 20'
  if (status === 'skipped') return '—'
  return job.next_action || 'Awaiting response'
}

function AppliedJobs({ jobs, onStatusChange, onDelete }) {
  const [selectedJob, setSelectedJob] = useState(null)
  const [sidebarOpen, setSidebarOpen] = useState(false)

  const appliedJobs = useMemo(
    () =>
      jobs
        .filter((job) => APPLIED_STATUSES.includes(normalizeStatus(job.Status)) || normalizeStatus(job.Status) === 'skipped')
        .sort((left, right) => (right['Skill Score'] || 0) - (left['Skill Score'] || 0)),
    [jobs],
  )

  const selectedIndex = selectedJob
    ? appliedJobs.findIndex((job) => getJobId(job) === getJobId(selectedJob))
    : -1
  const hasPrev = selectedIndex > 0
  const hasNext = selectedIndex !== -1 && selectedIndex < appliedJobs.length - 1

  return (
    <section className="applied-page">
      <header className="applied-header">
        <h1>Applied</h1>
        <p>{appliedJobs.length} applications in progress</p>
      </header>

      <section className="applied-stage-grid">
        {STAGES.map((stage) => {
          const count = appliedJobs.filter((job) => stageFor(job) === stage.key).length
          return (
            <div key={stage.key} className="applied-stage-card">
              <div>
                <span>{stage.icon}</span>
                <p>{stage.label}</p>
              </div>
              <strong>{count}</strong>
            </div>
          )
        })}
      </section>

      <section className="applications-table">
        <div className="applications-table-head">
          <span>Position</span>
          <span>Status</span>
          <span>Applied</span>
          <span>Next Action</span>
          <span />
        </div>

        {appliedJobs.map((job) => {
          const stage = stageFor(job)
          return (
            <button
              key={getJobId(job)}
              type="button"
              className="application-row"
              onClick={() => {
                setSelectedJob(job)
                setSidebarOpen(true)
              }}
            >
              <div className="application-position">
                <span>{(job.Company || 'J').charAt(0).toUpperCase()}</span>
                <div>
                  <p>{job.Title || 'Untitled role'}</p>
                  <small>{job.Company || 'Unknown company'}</small>
                </div>
              </div>
              <div>
                <span className={`application-status status-${stage}`}>{STATUS_LABELS[stage] || 'Applied'}</span>
              </div>
              <span className="application-muted">Apr 8, 2026</span>
              <span className="application-muted">{nextActionFor(job)}</span>
              <span className="application-arrow">↗</span>
            </button>
          )
        })}
      </section>

      {sidebarOpen && selectedJob && (
        <JobSidebar
          job={selectedJob}
          onClose={() => {
            setSidebarOpen(false)
            setSelectedJob(null)
          }}
          onStatusChange={onStatusChange}
          onDelete={onDelete}
          onPrev={() => hasPrev && setSelectedJob(appliedJobs[selectedIndex - 1])}
          onNext={() => hasNext && setSelectedJob(appliedJobs[selectedIndex + 1])}
          hasPrev={hasPrev}
          hasNext={hasNext}
        />
      )}
    </section>
  )
}

export default AppliedJobs
