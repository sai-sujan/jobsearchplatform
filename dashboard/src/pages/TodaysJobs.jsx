import { useMemo, useState } from 'react'
import JobCard from '../components/JobCard'
import JobSidebar from '../components/JobSidebar'
import { getDisplayMatchScore, getJobId } from '../lib/jobs'
import './TodaysJobs.css'

function formatTodayLine(count) {
  return `Monday, April 13 — ${count} new jobs match your search`
}

const TodaysJobs = ({ jobs, session, onStatusChange, onDelete }) => {
  const [selectedJob, setSelectedJob] = useState(null)
  const [sidebarOpen, setSidebarOpen] = useState(false)

  const rankedJobs = useMemo(
    () => [...jobs].sort((left, right) => getDisplayMatchScore(right) - getDisplayMatchScore(left)),
    [jobs],
  )

  const topMatches = rankedJobs.slice(0, 3)
  const newToday = rankedJobs.slice(0, 8)
  const topScore = topMatches[0] ? getDisplayMatchScore(topMatches[0]) : 0
  const appliedThisWeek = jobs.filter((job) => ['applied', 'interviewing', 'accepted'].includes(String(job.Status || '').toLowerCase())).length
  const interviews = jobs.filter((job) => String(job.Status || '').toLowerCase() === 'interviewing').length
  const firstName = (session?.full_name || session?.username || 'Jane').split(/\s+/)[0]

  const selectedIndex = selectedJob ? rankedJobs.findIndex((job) => getJobId(job) === getJobId(selectedJob)) : -1
  const hasPrev = selectedIndex > 0
  const hasNext = selectedIndex !== -1 && selectedIndex < rankedJobs.length - 1

  return (
    <section className="today-page">
      <header className="today-header">
        <div>
          <h1>Good morning, {firstName}</h1>
          <p>{formatTodayLine(newToday.length)}</p>
        </div>
        <button type="button" className="today-alert-button">
          <span aria-hidden="true">⌁</span>
          Alerts
        </button>
      </header>

      <section className="today-stats">
        {[
          { label: 'New Today', value: newToday.length, sub: '+3 vs yesterday', tone: 'dark' },
          { label: 'Top Match', value: `${topScore}%`, sub: topMatches[0] ? `${topMatches[0].Company} — ${topMatches[0].Title}` : 'No matches yet', tone: 'green' },
          { label: 'Applied This Week', value: appliedThisWeek, sub: '2 awaiting response', tone: 'blue' },
          { label: 'Interviews', value: interviews, sub: 'Next: Apr 15', tone: 'violet' },
        ].map((stat) => (
          <div key={stat.label} className="today-stat-card">
            <p>{stat.label}</p>
            <strong className={`stat-${stat.tone}`}>{stat.value}</strong>
            <span>{stat.sub}</span>
          </div>
        ))}
      </section>

      <section className="top-matches-section">
        <div className="today-section-head">
          <div>
            <span className="sparkle-icon" aria-hidden="true">✦</span>
            <h2>Top Matches for You</h2>
          </div>
          <button type="button">View all →</button>
        </div>

        <div className="top-match-grid">
          {topMatches.map((job) => (
            <button
              key={getJobId(job)}
              type="button"
              className="top-match-card"
              onClick={() => {
                setSelectedJob(job)
                setSidebarOpen(true)
              }}
            >
              <div className="top-match-card-head">
                <span>{(job.Company || 'J').charAt(0).toUpperCase()}</span>
                <strong>{getDisplayMatchScore(job)}%</strong>
              </div>
              <h3>{job.Title || 'Untitled role'}</h3>
              <p>{job.Company || 'Unknown company'} · {job['Job Type'] || 'Remote'}</p>
              <small>{job.Salary || job.Location || 'Matched role'}</small>
            </button>
          ))}
        </div>
      </section>

      <section className="new-today-section">
        <div className="today-section-head">
          <h2>New Today</h2>
          <button type="button" className="filter-chip-button">⌯ Filter</button>
        </div>

        {newToday.length === 0 ? (
          <div className="empty-state">
            <h2>No roles yet</h2>
            <p>Your matched jobs will appear here after delivery finishes.</p>
          </div>
        ) : (
          <div className="today-job-list">
            {newToday.map((job) => (
              <JobCard
                key={getJobId(job)}
                job={job}
                onClick={(nextJob) => {
                  setSelectedJob(nextJob)
                  setSidebarOpen(true)
                }}
              />
            ))}
          </div>
        )}
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
          onPrev={() => hasPrev && setSelectedJob(rankedJobs[selectedIndex - 1])}
          onNext={() => hasNext && setSelectedJob(rankedJobs[selectedIndex + 1])}
          hasPrev={hasPrev}
          hasNext={hasNext}
        />
      )}
    </section>
  )
}

export default TodaysJobs
