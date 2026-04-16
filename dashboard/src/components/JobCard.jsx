import { formatCompactDate, getDisplayMatchScore, getJobId, getSourceLabel, normalizeStatus } from '../lib/jobs'
import './JobCard.css'

const STATUS_LABELS = {
  not_applied: 'Saved',
  applied: 'Applied',
  interviewing: 'Interview',
  accepted: 'Offer',
  skipped: 'Rejected',
}

const COMPANY_THEMES = ['purple', 'black', 'violet', 'coral', 'black', 'indigo', 'blue', 'ink']

function getCompanyTheme(company = '') {
  const input = company || 'job'
  let hash = 0
  for (let index = 0; index < input.length; index += 1) {
    hash = (hash * 33 + input.charCodeAt(index)) % COMPANY_THEMES.length
  }
  return COMPANY_THEMES[Math.abs(hash)]
}

function getScoreClass(score) {
  if (score >= 90) return 'score-great'
  if (score >= 80) return 'score-good'
  if (score >= 70) return 'score-warm'
  return 'score-muted'
}

function getSkills(job) {
  return String(job['Matched Skills'] || job['Tech Stack'] || '')
    .split(/[,|]/)
    .map((skill) => skill.trim())
    .filter(Boolean)
    .slice(0, 4)
}

function JobCard({ job, onClick, compact = false }) {
  const companyInitial = (job.Company || 'J').trim().charAt(0).toUpperCase()
  const status = normalizeStatus(job.Status)
  const score = getDisplayMatchScore(job)
  const skills = getSkills(job)
  const source = getSourceLabel(job)
  const location = job.Location || 'Remote'
  const salary = job.Salary || job.salary || ''
  const posted = formatCompactDate(job['Date Found'])
  const type = job['Job Type'] || job.remote || 'Remote'

  return (
    <button
      type="button"
      className={`job-card ${compact ? 'job-card-compact' : ''}`}
      onClick={() => onClick?.(job)}
      data-job-id={getJobId(job)}
    >
      <div className="job-card-main">
        <span className={`company-monogram company-${getCompanyTheme(job.Company)}`} aria-hidden="true">
          {companyInitial}
        </span>

        <div className="job-card-copy">
          <div className="job-card-title-row">
            <div className="job-card-title-copy">
              <h3>{job.Title || 'Untitled role'}</h3>
              <p>{job.Company || 'Unknown company'}</p>
            </div>

            <div className="job-card-badges">
              {status !== 'not_applied' && (
                <span className={`stage-badge stage-${status}`}>{STATUS_LABELS[status] || 'Saved'}</span>
              )}
              <span className={`match-badge ${getScoreClass(score)}`}>{score}%</span>
            </div>
          </div>

          {!compact && (
            <>
              <div className="job-card-meta">
                <span>{location}</span>
                {salary ? <span>{salary}</span> : null}
                <span>{posted}</span>
              </div>

              <div className="job-card-skills">
                <span className="job-skill-chip">{type}</span>
                {skills.map((skill) => (
                  <span key={`${getJobId(job)}-${skill}`} className="job-skill-chip">
                    {skill}
                  </span>
                ))}
                {source && <span className="job-skill-chip source-chip">{source}</span>}
              </div>

              <span className="job-card-cta" aria-hidden="true">
                View match
              </span>
            </>
          )}
        </div>
      </div>
    </button>
  )
}

export default JobCard
