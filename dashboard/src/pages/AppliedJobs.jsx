import { useMemo, useState } from 'react'
import JobCard from '../components/JobCard'
import JobSidebar from '../components/JobSidebar'
import { APPLIED_STATUSES, formatDisplayDate, getJobId, normalizeStatus } from '../lib/jobs'
import './AppliedJobs.css'

const STAGE_FILTERS = [
  { value: 'all', label: 'All' },
  { value: 'applied', label: 'Applied' },
  { value: 'interviewing', label: 'Interviewing' },
  { value: 'accepted', label: 'Offer' },
]

const STAGE_SORT_ORDER = {
  interviewing: 0,
  applied: 1,
  accepted: 2,
}

function AppliedJobs({ jobs, onStatusChange, onDelete }) {
  const [selectedJob, setSelectedJob] = useState(null)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [searchText, setSearchText] = useState('')
  const [stageFilter, setStageFilter] = useState('all')
  const [sourceFilter, setSourceFilter] = useState('all')

  const appliedJobs = useMemo(
    () =>
      jobs
        .filter((job) => APPLIED_STATUSES.includes(normalizeStatus(job.Status)))
        .sort((left, right) => {
          const statusDelta =
            (STAGE_SORT_ORDER[normalizeStatus(left.Status)] ?? 99) -
            (STAGE_SORT_ORDER[normalizeStatus(right.Status)] ?? 99)

          if (statusDelta !== 0) return statusDelta
          return (right['Skill Score'] || 0) - (left['Skill Score'] || 0)
        }),
    [jobs],
  )

  const filteredJobs = useMemo(() => {
    return appliedJobs.filter((job) => {
      if (stageFilter !== 'all' && normalizeStatus(job.Status) !== stageFilter) return false
      if (sourceFilter !== 'all' && (job.Source || 'Web') !== sourceFilter) return false

      const search = searchText.trim().toLowerCase()
      if (!search) return true

      return [
        job.Title,
        job.Company,
        job.Location,
        job['Matched Skills'],
        job['Search Query'],
      ]
        .join(' ')
        .toLowerCase()
        .includes(search)
    })
  }, [appliedJobs, searchText, sourceFilter, stageFilter])

  const selectedJobRecord = selectedJob
    ? filteredJobs.find((job) => getJobId(job) === getJobId(selectedJob)) ||
      appliedJobs.find((job) => getJobId(job) === getJobId(selectedJob)) ||
      selectedJob
    : null

  const selectedIndex = selectedJobRecord
    ? filteredJobs.findIndex((job) => getJobId(job) === getJobId(selectedJobRecord))
    : -1

  const hasPrev = selectedIndex > 0
  const hasNext = selectedIndex !== -1 && selectedIndex < filteredJobs.length - 1
  const visibleSources = [...new Set(appliedJobs.map((job) => job.Source || 'Web'))].sort()

  const stageCounts = STAGE_FILTERS.reduce((accumulator, filter) => {
    accumulator[filter.value] =
      filter.value === 'all'
        ? appliedJobs.length
        : appliedJobs.filter((job) => normalizeStatus(job.Status) === filter.value).length
    return accumulator
  }, {})

  const interviewingCount = stageCounts.interviewing || 0
  const offerCount = stageCounts.accepted || 0

  return (
    <section className="page-shell applied-shell">
      <header className="page-hero">
        <div className="applied-hero-copy">
          <span className="eyebrow">Applications</span>
          <h1>Submitted roles and active interview pipelines.</h1>
          <p>
            Review the jobs you have already moved on, filter by stage, and open any role to update
            notes, status, and application details.
          </p>
        </div>

        <div className="hero-metrics">
          <div className="hero-metric">
            <strong>{appliedJobs.length}</strong>
            <span>Active applications</span>
          </div>
          <div className="hero-metric">
            <strong>{interviewingCount}</strong>
            <span>Interviewing</span>
          </div>
          <div className="hero-metric">
            <strong>{offerCount}</strong>
            <span>Offers</span>
          </div>
        </div>
      </header>

      <section className="applied-toolbar">
        <label className="applied-search">
          <span>Search</span>
          <input
            value={searchText}
            onChange={(event) => setSearchText(event.target.value)}
            placeholder="Role, company, location, or matched skill"
          />
        </label>

        <label>
          <span>Source</span>
          <select value={sourceFilter} onChange={(event) => setSourceFilter(event.target.value)}>
            <option value="all">All sources</option>
            {visibleSources.map((source) => (
              <option key={source} value={source}>
                {source}
              </option>
            ))}
          </select>
        </label>

        <div className="applied-meta-note">Updated {formatDisplayDate(new Date())}</div>
      </section>

      <div className="applied-stage-row" aria-label="Application stages">
        {STAGE_FILTERS.map((filter) => (
          <button
            key={filter.value}
            type="button"
            className={`applied-stage-chip ${stageFilter === filter.value ? 'active' : ''}`}
            onClick={() => setStageFilter(filter.value)}
          >
            {filter.label}
            <span>{stageCounts[filter.value] || 0}</span>
          </button>
        ))}
      </div>

      <div className="applied-results-bar">
        <p>
          <strong>{filteredJobs.length}</strong> roles in view
        </p>
        <p>Use Tracker for drag-and-drop movement across every stage.</p>
      </div>

      {filteredJobs.length === 0 ? (
        <div className="empty-state">
          <span className="empty-state-icon">No applications here</span>
          <h2>No roles match the current filters.</h2>
          <p>Try another stage or widen the search to bring applications back into view.</p>
        </div>
      ) : (
        <div className={`job-board applied-board ${sidebarOpen ? 'with-sidebar' : ''}`}>
          {filteredJobs.map((job) => (
            <JobCard
              key={getJobId(job)}
              job={job}
              onClick={(nextJob) => {
                setSelectedJob(nextJob)
                setSidebarOpen(true)
              }}
              onStatusChange={onStatusChange}
            />
          ))}
        </div>
      )}

      {sidebarOpen && selectedJobRecord && (
        <JobSidebar
          job={selectedJobRecord}
          onClose={() => {
            setSidebarOpen(false)
            setSelectedJob(null)
          }}
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
