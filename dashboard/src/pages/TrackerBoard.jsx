import { useMemo, useState } from 'react'
import JobSidebar from '../components/JobSidebar'
import TrackerCard from '../components/TrackerCard'
import { getJobId, normalizeStatus } from '../lib/jobs'
import './TrackerBoard.css'

const TRACKER_COLUMNS = [
  {
    key: 'not_applied',
    label: 'Saved',
    description: 'Ready for review.',
  },
  {
    key: 'applied',
    label: 'Applied',
    description: 'Already submitted.',
  },
  {
    key: 'interviewing',
    label: 'Interviewing',
    description: 'In process.',
  },
  {
    key: 'accepted',
    label: 'Offer',
    description: 'Positive outcomes.',
  },
  {
    key: 'skipped',
    label: 'Rejected',
    description: 'Closed out.',
  },
]

function TrackerBoard({ jobs, onStatusChange, onDelete }) {
  const [selectedJob, setSelectedJob] = useState(null)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [searchText, setSearchText] = useState('')
  const [sourceFilter, setSourceFilter] = useState('all')
  const [minMatch, setMinMatch] = useState('0')
  const [draggedJobId, setDraggedJobId] = useState(null)
  const [activeDropColumn, setActiveDropColumn] = useState(null)

  const filteredJobs = useMemo(() => {
    return jobs.filter((job) => {
      const search = searchText.trim().toLowerCase()
      if (search) {
        const haystack = [
          job.Title,
          job.Company,
          job.Location,
          job['Matched Skills'],
          job['Search Query'],
        ]
          .join(' ')
          .toLowerCase()

        if (!haystack.includes(search)) return false
      }

      if (sourceFilter !== 'all' && (job.Source || 'Web') !== sourceFilter) return false
      if ((job['Skill Score'] || 0) < Number(minMatch)) return false

      return true
    })
  }, [jobs, minMatch, searchText, sourceFilter])

  const columnJobs = TRACKER_COLUMNS.map((column) => ({
    ...column,
    jobs: filteredJobs.filter((job) => normalizeStatus(job.Status) === column.key),
  }))

  const selectedJobRecord = selectedJob
    ? filteredJobs.find((job) => getJobId(job) === getJobId(selectedJob)) ||
      jobs.find((job) => getJobId(job) === getJobId(selectedJob)) ||
      selectedJob
    : null

  const selectedIndex = selectedJobRecord
    ? filteredJobs.findIndex((job) => getJobId(job) === getJobId(selectedJobRecord))
    : -1

  const hasPrev = selectedIndex > 0
  const hasNext = selectedIndex !== -1 && selectedIndex < filteredJobs.length - 1
  const visibleSources = [...new Set(jobs.map((job) => job.Source || 'Web'))].sort()
  const totalTracked = filteredJobs.length

  const handleDrop = (columnKey) => {
    if (!draggedJobId) return

    const draggedJob = jobs.find((job) => getJobId(job) === draggedJobId)
    setDraggedJobId(null)
    setActiveDropColumn(null)

    if (!draggedJob) return
    if (normalizeStatus(draggedJob.Status) === columnKey) return

    onStatusChange(draggedJob, columnKey)
  }

  return (
    <section className="page-shell tracker-shell">
      <header className="tracker-header">
        <div className="tracker-header-copy">
          <span className="eyebrow">Application board</span>
          <h1>Your tracker board</h1>
          <div className="tracker-summary-row">
            <strong>{totalTracked} total jobs</strong>
            <span>One place for every stage.</span>
            <span className="tracker-drag-note">Drag cards between columns to move them.</span>
          </div>
        </div>

        <div className="tracker-toolbar-actions">
          <button className="tracker-ghost-action" type="button">Tracked jobs</button>
          <button className="tracker-ghost-action" type="button">Board view</button>
          <button className="primary-action" type="button" disabled>Linked by your matched jobs</button>
        </div>
      </header>

      <section className="tracker-filters">
        <label className="tracker-search">
          <span>Search</span>
          <input
            value={searchText}
            onChange={(event) => setSearchText(event.target.value)}
            placeholder="Search roles or companies"
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
            <option value="50">50%+</option>
            <option value="70">70%+</option>
            <option value="85">85%+</option>
          </select>
        </label>

        <div className="tracker-filter-meta">
          <span>{columnJobs.reduce((total, column) => total + column.jobs.length, 0)} matched jobs</span>
        </div>
      </section>

      <div className={`tracker-board-wrap ${sidebarOpen ? 'with-sidebar' : ''}`}>
        <div className="tracker-board">
          {columnJobs.map((column) => (
            <section
              key={column.key}
              className={`tracker-column ${activeDropColumn === column.key ? 'drop-target' : ''}`}
              onDragOver={(event) => {
                if (!draggedJobId) return
                event.preventDefault()
                event.dataTransfer.dropEffect = 'move'
                if (activeDropColumn !== column.key) {
                  setActiveDropColumn(column.key)
                }
              }}
              onDrop={(event) => {
                event.preventDefault()
                handleDrop(column.key)
              }}
            >
              <header className="tracker-column-header">
                <div>
                  <h2>{column.label}</h2>
                  <p>{column.description}</p>
                </div>
                <span>{column.jobs.length}</span>
              </header>

              <div className={`tracker-column-body ${activeDropColumn === column.key ? 'drop-ready' : ''}`}>
                {draggedJobId && (
                  <div className={`tracker-drop-helper ${activeDropColumn === column.key ? 'visible' : ''}`}>
                    Drop here to move into {column.label.toLowerCase()}
                  </div>
                )}
                {column.jobs.length === 0 ? (
                  <div className="tracker-empty-column">No jobs in this stage.</div>
                ) : (
                  column.jobs.map((job) => (
                    <TrackerCard
                      key={getJobId(job)}
                      job={job}
                      isDragging={draggedJobId === getJobId(job)}
                      onDragStart={(nextJob) => {
                        setDraggedJobId(getJobId(nextJob))
                      }}
                      onDragEnd={() => {
                        setDraggedJobId(null)
                        setActiveDropColumn(null)
                      }}
                      onClick={(nextJob) => {
                        setSelectedJob(nextJob)
                        setSidebarOpen(true)
                      }}
                      onStatusChange={onStatusChange}
                    />
                  ))
                )}
              </div>
            </section>
          ))}
        </div>
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

export default TrackerBoard
