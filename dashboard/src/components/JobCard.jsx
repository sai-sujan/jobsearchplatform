import {
  formatCompactDate,
  getDisplayMatchScore,
  getIndustryFitLabel,
  getJobId,
  getMatchedSkills,
  getSourceLabel,
  getTierVariant,
  normalizeStatus,
} from '../lib/jobs'
import './JobCard.css'

const STATUS_OPTIONS = [
  { value: 'not_applied', label: 'Not applied' },
  { value: 'skipped', label: 'Skipped' },
  { value: 'applied', label: 'Applied' },
  { value: 'interviewing', label: 'Interviewing' },
  { value: 'accepted', label: 'Accepted' },
]

function JobCard({ job, onClick, onStatusChange }) {
  const skills = getMatchedSkills(job, 3)
  const tierVariant = getTierVariant(job)
  const status = normalizeStatus(job.Status)
  const companyInitial = (job.Company || 'J').trim().charAt(0).toUpperCase()
  const displayScore = getDisplayMatchScore(job)
  const industryFit = getIndustryFitLabel(job)

  return (
    <article
      className={`job-card tier-${tierVariant} status-${status}`}
      onClick={() => onClick?.(job)}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          onClick?.(job)
        }
      }}
      role="button"
      tabIndex={0}
    >
      <div className="job-card-topline">
        <span className="job-source-badge">{getSourceLabel(job)}</span>
        <span className="job-date-pill">{formatCompactDate(job['Date Found'])}</span>
      </div>

      <div className="job-card-heading">
        <span className="company-monogram" aria-hidden="true">{companyInitial}</span>
        <div className="job-card-heading-copy">
          <div className="job-card-heading-row">
            <h3>{job.Title || 'Untitled role'}</h3>
            <span className="job-score-pill">{displayScore}% fit</span>
          </div>
          <p>{job.Company || 'Unknown company'}</p>
        </div>
      </div>

      <div className="job-card-meta">
        <span>{job.Location || 'Remote / flexible'}</span>
        <span>{job.Match || '0/0 skills'}</span>
      </div>

      {skills.length > 0 && (
        <div className="job-skill-row">
          {skills.map((skill) => (
            <span key={`${getJobId(job)}-${skill}`} className="job-skill-chip">
              {skill}
            </span>
          ))}
          {industryFit && <span className="job-skill-chip">{industryFit}</span>}
        </div>
      )}

      <div className="job-card-footer">
        <label className="job-status-field">
          <span>Status</span>
          <select
            value={status}
            onChange={(event) => {
              event.stopPropagation()
              onStatusChange?.(job, event.target.value)
            }}
            onClick={(event) => event.stopPropagation()}
            className="job-status-select"
          >
            {STATUS_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        <a
          href={job.Link || '#'}
          target="_blank"
          rel="noopener noreferrer"
          className="job-open-link"
          onClick={(event) => event.stopPropagation()}
        >
          Open role
        </a>
      </div>
    </article>
  )
}

export default JobCard
