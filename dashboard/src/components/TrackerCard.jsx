import { getDisplayMatchScore, getJobId } from '../lib/jobs'
import './TrackerCard.css'

function TrackerCard({ job, isDragging = false, onClick, onDragStart, onDragEnd }) {
  return (
    <article
      className={`tracker-card ${isDragging ? 'is-dragging' : ''}`}
      draggable
      onDragStart={(event) => {
        event.dataTransfer.effectAllowed = 'move'
        event.dataTransfer.setData('text/plain', getJobId(job))
        onDragStart?.(job)
      }}
      onDragEnd={() => onDragEnd?.()}
      onClick={() => {
        if (!isDragging) onClick?.(job)
      }}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          onClick?.(job)
        }
      }}
      role="button"
      tabIndex={0}
    >
      <div className="tracker-card-top">
        <div className="tracker-card-copy">
          <h3>{job.Title || 'Untitled role'}</h3>
          <p>{job.Company || 'Unknown company'}</p>
        </div>
      </div>
      <div className="tracker-card-bottom">
        <span>{job.Salary || job.Location || 'Matched role'}</span>
        <span>{getDisplayMatchScore(job)}%</span>
      </div>
    </article>
  )
}

export default TrackerCard
