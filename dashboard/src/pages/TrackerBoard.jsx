import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import JobSidebar from '../components/JobSidebar'
import TrackerCard from '../components/TrackerCard'
import { getJobId, normalizeStatus } from '../lib/jobs'
import './TrackerBoard.css'

const COLUMNS = [
  { key: 'not_applied', label: 'Saved', dot: 'slate' },
  { key: 'applied', label: 'Applied', dot: 'blue' },
  { key: 'screening', label: 'Screening', dot: 'amber' },
  { key: 'interviewing', label: 'Interview', dot: 'violet' },
  { key: 'accepted', label: 'Offer', dot: 'emerald' },
  { key: 'skipped', label: 'Rejected', dot: 'red' },
]

function getColumnStatus(job) {
  const status = normalizeStatus(job.Status)
  return status === 'screening' ? 'screening' : status
}

function TrackerBoard({ jobs, onStatusChange, onDelete }) {
  const navigate = useNavigate()
  const [selectedJob, setSelectedJob] = useState(null)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [draggedJobId, setDraggedJobId] = useState(null)

  const columnJobs = useMemo(
    () =>
      COLUMNS.map((column) => ({
        ...column,
        jobs: jobs.filter((job) => getColumnStatus(job) === column.key),
      })),
    [jobs],
  )

  const selectedIndex = selectedJob ? jobs.findIndex((job) => getJobId(job) === getJobId(selectedJob)) : -1
  const hasPrev = selectedIndex > 0
  const hasNext = selectedIndex !== -1 && selectedIndex < jobs.length - 1

  const handleDrop = (columnKey) => {
    if (!draggedJobId) return
    const draggedJob = jobs.find((job) => getJobId(job) === draggedJobId)
    setDraggedJobId(null)
    if (!draggedJob || getColumnStatus(draggedJob) === columnKey) return
    onStatusChange?.(draggedJob, columnKey)
  }

  return (
    <section className="tracker-page">
      <header className="tracker-page-header">
        <h1>Tracker Board</h1>
        <p>Drag and drop jobs between stages</p>
      </header>

      <div className="tracker-board-scroll">
        <div className="tracker-board">
          {columnJobs.map((column) => (
            <section
              key={column.key}
              className="tracker-column"
              onDragOver={(event) => event.preventDefault()}
              onDrop={() => handleDrop(column.key)}
            >
              <header className="tracker-column-header">
                <div>
                  <span className={`tracker-dot dot-${column.dot}`} />
                  <h2>{column.label}</h2>
                  <strong>{column.jobs.length}</strong>
                </div>
                <button type="button" title="Browse Discover to add jobs" onClick={() => navigate('/jobs')}>+</button>
              </header>

              <div className={`tracker-column-body column-${column.dot}`}>
                {column.jobs.map((job) => (
                  <TrackerCard
                    key={getJobId(job)}
                    job={job}
                    isDragging={draggedJobId === getJobId(job)}
                    onDragStart={(nextJob) => setDraggedJobId(getJobId(nextJob))}
                    onDragEnd={() => setDraggedJobId(null)}
                    onClick={(nextJob) => {
                      setSelectedJob(nextJob)
                      setSidebarOpen(true)
                    }}
                  />
                ))}
              </div>
            </section>
          ))}
        </div>
      </div>

      {sidebarOpen && selectedJob && (
        <JobSidebar
          job={selectedJob}
          onClose={() => {
            setSidebarOpen(false)
            setSelectedJob(null)
          }}
          onStatusChange={onStatusChange}
          onDelete={onDelete}
          onPrev={() => hasPrev && setSelectedJob(jobs[selectedIndex - 1])}
          onNext={() => hasNext && setSelectedJob(jobs[selectedIndex + 1])}
          hasPrev={hasPrev}
          hasNext={hasNext}
        />
      )}
    </section>
  )
}

export default TrackerBoard
