import React from 'react'
import { BellIcon } from '../icons/DashboardIcons'

export const PriorityFollowUps = ({ displayFollowUps, onViewAll, onFollowUp }) => {
  return (
    <div className="tj-follow-module">
      <div className="tj-module-header">
        <h2 className="tj-module-title">
          <BellIcon style={{ color: '#10B981' }} /> Priority Follow-ups
        </h2>
        <button type="button" className="tj-view-all" onClick={onViewAll}>View All</button>
      </div>
      <div className="tj-follow-compact-table">
        <div className="tj-follow-header-row">
          <span>Company &amp; Role</span>
          <span>Status</span>
          <span style={{textAlign: 'right'}}>Action Needed</span>
        </div>
        {displayFollowUps.length === 0 ? (
          <div className="tj-follow-empty">No follow-ups needed right now. Keep applying!</div>
        ) : displayFollowUps.map((item, idx) => (
          <div key={idx} className="tj-follow-item-row">
            <div className="tj-f-comp">
              <div className="tj-f-logo">{item.job.company?.[0] || 'X'}</div>
              <div className="tj-f-info">
                <strong>{item.job.company}</strong>
                <small>{item.job.title}</small>
              </div>
            </div>
            <div className="tj-f-status">
              <span className={`tj-f-badge ${item.tone || 'blue'}`}>
                {item.status || `Applied ${item.days}d ago`}
              </span>
            </div>
            <button type="button" className="tj-f-action" onClick={() => onFollowUp?.(item.job)}>
              Follow up &gt;
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}
