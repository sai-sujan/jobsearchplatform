import { useState } from 'react'
import JobCard from '../components/JobCard'
import JobSidebar from '../components/JobSidebar'
import { getJobId, getSourceLabel, getTierVariant } from '../lib/jobs'
import './TodaysJobs.css'

const TodaysJobs = ({ jobs, onStatusChange, onDelete }) => {
  const [selectedJob, setSelectedJob] = useState(null)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [searchText, setSearchText] = useState('')
  const [sourceFilter, setSourceFilter] = useState('all')
  const [minMatch, setMinMatch] = useState('0')

  const visibleSources = [...new Set(jobs.map((job) => getSourceLabel(job)))].sort()

  const todaysJobs = [...jobs]
    .filter((job) => {
      const query = searchText.trim().toLowerCase()
      if (query) {
        const haystack = [
          job.Title,
          job.Company,
          job.Location,
          job['Matched Skills'],
          job['Search Query'],
        ]
          .join(' ')
          .toLowerCase()

        if (!haystack.includes(query)) return false
      }

      if (sourceFilter !== 'all' && getSourceLabel(job) !== sourceFilter) return false
      if ((job['Skill Score'] || 0) < Number(minMatch)) return false
      return true
    })
    .sort((a, b) => (b['Skill Score'] || 0) - (a['Skill Score'] || 0))

  const summary = todaysJobs.reduce(
    (accumulator, job) => {
      accumulator.total += 1
      const tier = getTierVariant(job)
      if (tier === 'perfect') accumulator.perfect += 1
      if (tier === 'good') accumulator.good += 1
      return accumulator
    },
    { total: 0, perfect: 0, good: 0 },
  )

  const selectedIndex = selectedJob
    ? todaysJobs.findIndex((job) => getJobId(job) === getJobId(selectedJob))
    : -1

  const hasPrev = selectedIndex > 0
  const hasNext = selectedIndex !== -1 && selectedIndex < todaysJobs.length - 1

  return (
    <section className="page-shell">
      <header className="jobs-page-header">
        <div>
          <span className="eyebrow">Recommended</span>
          <h1>Matched jobs</h1>
          <p>{todaysJobs.length} roles ready to review, ranked by profile fit.</p>
        </div>

        {todaysJobs.length > 0 ? (
          <div className="hero-metrics">
            <div className="hero-metric">
              <strong>{summary.total}</strong>
              <span>Recommended</span>
            </div>
            <div className="hero-metric">
              <strong>{summary.perfect}</strong>
              <span>Top-fit</span>
            </div>
            <div className="hero-metric">
              <strong>{summary.good}</strong>
              <span>Strong-fit</span>
            </div>
          </div>
        ) : null}
      </header>

      <section className="jobs-toolbar">
        <label className="jobs-search">
          <span>Search</span>
          <input
            value={searchText}
            onChange={(event) => setSearchText(event.target.value)}
            placeholder="Search roles, companies, skills..."
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

        <label>
          <span>Minimum match</span>
          <select value={minMatch} onChange={(event) => setMinMatch(event.target.value)}>
            <option value="0">Any match</option>
            <option value="60">60%+</option>
            <option value="75">75%+</option>
            <option value="90">90%+</option>
          </select>
        </label>
      </section>

      {todaysJobs.length === 0 ? (
        <div className="empty-state">
          <span className="empty-state-icon">No roles in this view</span>
          <h2>Your feed is ready, but these filters are too narrow.</h2>
          <p>
            Try clearing search or lowering the match threshold. If this is a brand-new account,
            matched roles will appear here as soon as delivery finishes.
          </p>
          <div className="empty-state-checklist">
            <div>Profile completed</div>
            <div>Resume saved</div>
            <div>Search setup generated</div>
          </div>
        </div>
      ) : (
        <div className={`job-board ${sidebarOpen ? 'with-sidebar' : ''}`}>
          {todaysJobs.map((job) => (
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

      {sidebarOpen && (
        <JobSidebar
          job={selectedJob}
          onClose={() => {
            setSidebarOpen(false)
            setTimeout(() => setSelectedJob(null), 250)
          }}
          onStatusChange={onStatusChange}
          onDelete={onDelete}
          onPrev={() => hasPrev && setSelectedJob(todaysJobs[selectedIndex - 1])}
          onNext={() => hasNext && setSelectedJob(todaysJobs[selectedIndex + 1])}
          hasPrev={hasPrev}
          hasNext={hasNext}
        />
      )}
    </section>
  )
}

export default TodaysJobs
