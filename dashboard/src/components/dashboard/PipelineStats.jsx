import React from 'react'
import { PieChartIcon, ChevronDownIcon } from '../icons/DashboardIcons'

export const PipelineStats = ({ appliedCount, screeningCount, interviewingCount, offersCount }) => {
  const totalActive = appliedCount + screeningCount + interviewingCount + offersCount || 1

  return (
    <div className="tj-pipeline-card">
      <div className="tj-pipe-header">
        <h2 className="tj-pipe-title">
          <PieChartIcon style={{ color: '#10B981' }} /> Interview Pipeline
        </h2>
        <div className="tj-pipe-filter">
          This Month <ChevronDownIcon />
        </div>
      </div>
      
      <div className="tj-pipe-grid-pro">
        <div className="tj-pipe-stat">
          <span className="tj-pipe-label"><div className="tj-pipe-dot applied"></div> Applied</span>
          <div className="tj-pipe-number">{appliedCount || 0} <small>jobs</small></div>
        </div>
        <div className="tj-pipe-stat">
          <span className="tj-pipe-label"><div className="tj-pipe-dot screening"></div> Screening</span>
          <div className="tj-pipe-number">{screeningCount || 0} <small>calls</small></div>
        </div>
        <div className="tj-pipe-stat">
          <span className="tj-pipe-label"><div className="tj-pipe-dot interviews"></div> Interviews</span>
          <div className="tj-pipe-number">{interviewingCount || 0} <small>scheduled</small></div>
        </div>
        <div className="tj-pipe-stat">
          <span className="tj-pipe-label"><div className="tj-pipe-dot offers"></div> Offers</span>
          <div className="tj-pipe-number">{offersCount || 0} <small>received</small></div>
        </div>
      </div>

      <div className="tj-pipe-progress-track">
        <div className="tj-progress-fill applied" style={{flex: appliedCount / totalActive}}></div>
        <div className="tj-progress-fill screening" style={{flex: screeningCount / totalActive}}></div>
        <div className="tj-progress-fill interviews" style={{flex: interviewingCount / totalActive}}></div>
        <div className="tj-progress-fill offers" style={{flex: offersCount / totalActive}}></div>
      </div>
    </div>
  )
}
