import { useState } from 'react'
import { Link } from 'react-router-dom'
import JobCard from '../components/JobCard'
import JobSidebar from '../components/JobSidebar'
import { getJobId, getTierVariant } from '../lib/jobs'
import './TodaysJobs.css'

const TodaysJobs = ({ jobs, onStatusChange, onDelete }) => {
  const [selectedJob, setSelectedJob] = useState(null)
  const [sidebarOpen, setSidebarOpen] = useState(false)

  const todaysJobs = [...jobs].sort((a, b) => (b['Skill Score'] || 0) - (a['Skill Score'] || 0))

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
      <header className="page-hero">
        <div>
          <span className="eyebrow">Recommended for you</span>
          <h1>Your matched roles, ranked by fit and ready to review.</h1>
          <p>
            This feed only shows roles already matched to your profile. Open a role to review the fit,
            track your progress, and refine your application notes.
          </p>
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
        ) : (
          <div className="hero-empty-note">
            <strong>Your profile is ready.</strong>
            <p>We’ll show recommendations here as soon as matched roles are delivered to your account.</p>
          </div>
        )}
      </header>

      {todaysJobs.length === 0 ? (
        <div className="empty-state">
          <span className="empty-state-icon">Recommendations are warming up</span>
          <h2>Your matched job feed is ready for its first delivery.</h2>
          <p>
            Your account setup is complete. As soon as the matching service pushes roles into your
            workspace, they’ll appear here ranked by fit.
          </p>
          <div className="empty-state-checklist">
            <div>Profile completed</div>
            <div>Resume saved</div>
            <div>Search setup generated</div>
          </div>
          <Link to="/profile" className="secondary-action empty-state-action">
            Review profile setup
          </Link>
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
