import { formatCompactDate, getJobId, getSourceLabel, normalizeStatus } from '../lib/jobs'
import './TrackerCard.css'

const STATUS_OPTIONS = [
  { value: 'not_applied', label: 'Saved' },
  { value: 'applied', label: 'Applied' },
  { value: 'interviewing', label: 'Interviewing' },
  { value: 'accepted', label: 'Offer' },
  { value: 'skipped', label: 'Rejected' },
]

function TrackerCard({ job, isDragging = false, onClick, onStatusChange, onDragStart, onDragEnd }) {
  const companyInitial = (job.Company || 'J').trim().charAt(0).toUpperCase()
  const status = normalizeStatus(job.Status)

  return (
    <article
      className={`tracker-card tracker-${status} ${isDragging ? 'is-dragging' : ''}`}
      draggable
      onDragStart={(event) => {
        event.dataTransfer.effectAllowed = 'move'
        event.dataTransfer.setData('text/plain', getJobId(job))
        onDragStart?.(job)
      }}
      onDragEnd={() => onDragEnd?.()}
      onClick={() => {
        if (!isDragging) {
          onClick?.(job)
        }
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
        <div className="tracker-card-lead">
          <span className="tracker-logo">{companyInitial}</span>
          <span className="tracker-drag-handle" aria-hidden="true">
            Drag
          </span>
        </div>
        <div className="tracker-card-copy">
          <h3>{job.Title || 'Untitled role'}</h3>
          <p>{job.Company || 'Unknown company'}</p>
          <span>{job.Location || 'Remote / flexible'}</span>
        </div>
      </div>

      <div className="tracker-card-meta">
        <span className="tracker-meta-pill">{getSourceLabel(job)}</span>
        <span className="tracker-meta-pill tracker-match-pill">{job['Skill Score'] || 0}% match</span>
        <span className="tracker-date">{formatCompactDate(job['Date Found'])}</span>
      </div>

      <div className="tracker-card-actions">
        <select
          value={status}
          onChange={(event) => {
            event.stopPropagation()
            onStatusChange?.(job, event.target.value)
          }}
          onClick={(event) => event.stopPropagation()}
          className="tracker-stage-select"
        >
          {STATUS_OPTIONS.map((option) => (
            <option key={`${getJobId(job)}-${option.value}`} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>

        <a
          href={job.Link || '#'}
          target="_blank"
          rel="noopener noreferrer"
          className="tracker-open-link"
          onClick={(event) => event.stopPropagation()}
        >
          Open
        </a>
      </div>
    </article>
  )
}

export default TrackerCard
