import React from 'react'
import { StarSolidIcon, BookmarkIcon } from '../icons/DashboardIcons'

export const JobRecommendations = ({ topMatches, setSelectedJob }) => {
  return (
    <>
      <div className="tj-recommend-header">
        <div className="tj-rec-copy">
          <h2><StarSolidIcon style={{ color: '#10B981' }} /> Recommended Jobs</h2>
          <p className="tj-rec-subtitle">Based on your recent application activity</p>
        </div>
        <span className="tj-view-all-matches">
          View all matches {'>'}
        </span>
      </div>

      <div className="tj-rec-grid-3col">
        {topMatches.map((job, idx) => {
          const matchScore = job.matchScore || (95 - idx * 5);
          return (
            <div key={idx} className="tj-rec-card" onClick={() => setSelectedJob(job)}>
              <div className="tj-rec-card-top">
                <div className="tj-rec-info">
                  <div className="tj-rec-logo-box">
                    {job.Company ? job.Company[0] : 'J'}
                  </div>
                  <div className="tj-rec-title-wrap">
                    <h4 className="tj-rec-job-title">{job.Title || 'Role unknown'}</h4>
                    <p className="tj-rec-job-meta">{job.Company || 'Company'} • {job.Location || 'Remote'}</p>
                  </div>
                </div>
                <div className="tj-rec-match-badge">{matchScore}% Match</div>
              </div>
              <div className="tj-rec-card-bottom">
                <div className="tj-rec-tags">
                  <span className="tj-rec-tag">Full-time</span>
                  <span className="tj-rec-tag">Mid-Level</span>
                </div>
                <div className="tj-rec-salary">$120k-$150k</div>
              </div>
              <div className="tj-rec-card-actions">
                <button className="tj-btn-tailor-resume">Tailor Resume</button>
                <button className="tj-btn-bookmark">
                  <BookmarkIcon />
                </button>
              </div>
            </div>
          )
        })}
        {topMatches.length === 0 && (
          <div style={{ padding: '24px', color: '#64748B', fontStyle: 'italic', background: '#fff', borderRadius: '12px', border: '1px solid #E2E8F0' }}>
            No recommendations currently found.
          </div>
        )}
      </div>
    </>
  )
}
