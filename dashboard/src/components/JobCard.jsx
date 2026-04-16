import { useState } from 'react'
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
  { value: 'not_applied', label: 'Saved' },
  { value: 'applied', label: 'Applied' },
  { value: 'interviewing', label: 'Interviewing' },
  { value: 'accepted', label: 'Offer' },
  { value: 'skipped', label: 'Archived' },
]

function getStatusLabel(status) {
  return STATUS_OPTIONS.find((option) => option.value === status)?.label || 'Saved'
}

function MatchBadge({ score, tierVariant }) {
  const safeScore = Math.max(0, Math.min(100, Number(score) || 0))

  return (
    <div className={`match-badge match-${tierVariant}`} aria-label={`${safeScore}% match`}>
      <strong>{safeScore}%</strong>
      <span>match</span>
    </div>
  )
}

function JobCard({ job, onClick, onStatusChange }) {
  const [statusPickerOpen, setStatusPickerOpen] = useState(false)
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
        <div className="job-card-topline-left">
          <span className="job-source-badge">{getSourceLabel(job)}</span>
          <span className="job-date-pill">{formatCompactDate(job['Date Found'])}</span>
        </div>
        <MatchBadge score={displayScore} tierVariant={tierVariant} />
      </div>

      <div className="job-card-heading">
        <span className="company-monogram" aria-hidden="true">{companyInitial}</span>
        <div className="job-card-heading-copy">
          <div className="job-card-heading-row">
            <h3>{job.Title || 'Untitled role'}</h3>
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
        <div
          className="job-status-menu"
          onClick={(event) => event.stopPropagation()}
          onKeyDown={(event) => event.stopPropagation()}
        >
          <button
            type="button"
            className={`job-status-pill status-pill-${status}`}
            aria-expanded={statusPickerOpen}
            onClick={() => setStatusPickerOpen((isOpen) => !isOpen)}
          >
            <span aria-hidden="true" />
            {getStatusLabel(status)}
          </button>

          {statusPickerOpen && (
            <div className="job-status-popover">
              {STATUS_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  className={`job-status-option status-pill-${option.value} ${status === option.value ? 'active' : ''}`}
                  onClick={() => {
                    setStatusPickerOpen(false)
                    if (option.value !== status) {
                      onStatusChange?.(job, option.value)
                    }
                  }}
                >
                  <span aria-hidden="true" />
                  {option.label}
                </button>
              ))}
            </div>
          )}
        </div>

        <a
          href={job.Link || '#'}
          target="_blank"
          rel="noopener noreferrer"
          className="job-open-link"
          onClick={(event) => event.stopPropagation()}
        >
          View
          <span aria-hidden="true">→</span>
        </a>
      </div>
    </article>
  )
}

export default JobCard
