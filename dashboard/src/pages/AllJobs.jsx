import { useMemo, useState } from 'react'
import JobCard from '../components/JobCard'
import JobSidebar from '../components/JobSidebar'
import { getDisplayMatchScore, getJobId } from '../lib/jobs'
import './AllJobs.css'

const FILTERS = ['Remote', 'Hybrid', 'On-site', 'Entry', 'Mid', 'Senior']

function jobMatchesFilter(job, filter) {
  const text = [job.Title, job.Company, job.Location, job['Job Type'], job['Matched Skills'], job['Search Query']]
    .join(' ')
    .toLowerCase()
  return text.includes(filter.toLowerCase())
}

const AllJobs = ({ jobs, onStatusChange, onDelete }) => {
  const [selectedJob, setSelectedJob] = useState(null)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [activeFilters, setActiveFilters] = useState(['Remote'])
  const [view, setView] = useState('list')

  const filteredJobs = useMemo(() => {
    return jobs
      .filter((job) => {
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

        return true
      })
      .sort((left, right) => getDisplayMatchScore(right) - getDisplayMatchScore(left))
  }, [activeFilters, jobs, searchQuery])

  const selectedJobRecord = selectedJob
    ? filteredJobs.find((job) => getJobId(job) === getJobId(selectedJob)) || selectedJob
    : null
  const selectedIndex = selectedJobRecord
    ? filteredJobs.findIndex((job) => getJobId(job) === getJobId(selectedJobRecord))
    : -1
  const hasPrev = selectedIndex > 0
  const hasNext = selectedIndex !== -1 && selectedIndex < filteredJobs.length - 1

  const toggleFilter = (filter) => {
    setActiveFilters((current) =>
      current.includes(filter) ? current.filter((item) => item !== filter) : [...current, filter],
    )
  }

  return (
    <section className="alljobs-page">
      <header className="alljobs-header">
        <div className="alljobs-title-row">
          <div>
            <h1>All Jobs</h1>
            <p>{filteredJobs.length} jobs match your criteria</p>
          </div>

          <div className="view-toggle" aria-label="View mode">
            <button type="button" className={view === 'list' ? 'active' : ''} onClick={() => setView('list')}>
              ☷
            </button>
            <button type="button" className={view === 'grid' ? 'active' : ''} onClick={() => setView('grid')}>
              ⊞
            </button>
          </div>
        </div>

        <div className="alljobs-search-row">
          <label className="alljobs-search">
            <span aria-hidden="true">⌕</span>
            <input
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Search jobs, companies, skills..."
            />
          </label>
          <button type="button" className="alljobs-filter-button">☷ Filters</button>
        </div>

        <div className="active-filter-row">
          {activeFilters.map((filter) => (
            <button key={filter} type="button" className="active-filter" onClick={() => toggleFilter(filter)}>
              {filter} ×
            </button>
          ))}
          {FILTERS.filter((filter) => !activeFilters.includes(filter)).slice(0, 5).map((filter) => (
            <button key={filter} type="button" className="inactive-filter" onClick={() => toggleFilter(filter)}>
              {filter}
            </button>
          ))}
        </div>
      </header>

      <div className="alljobs-list-wrap">
        {filteredJobs.length === 0 ? (
          <div className="empty-state">
            <h2>No matching jobs</h2>
            <p>Try removing a filter or changing the search text.</p>
          </div>
        ) : (
          <div className={view === 'grid' ? 'alljobs-grid' : 'alljobs-list'}>
            {filteredJobs.map((job) => (
              <JobCard
                key={getJobId(job)}
                job={job}
                compact={view === 'grid'}
                onClick={(nextJob) => {
                  setSelectedJob(nextJob)
                  setSidebarOpen(true)
                }}
              />
            ))}
          </div>
        )}
      </div>

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

export default AllJobs
