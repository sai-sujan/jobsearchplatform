import React from 'react'
import { TrendUpIcon } from '../icons/DashboardIcons'

export const ActivityChart = ({ spline }) => {
  return (
    <div className="tj-activity-module">
      <div className="tj-module-header" style={{ marginBottom: 0 }}>
        <h2 className="tj-module-title">
          <TrendUpIcon style={{ color: '#10B981' }} /> Application Activity
        </h2>
        <div className="tj-activity-filters">
          <span className="tj-filter-pill">W</span>
          <span className="tj-filter-pill active">M</span>
          <span className="tj-filter-pill">Y</span>
        </div>
      </div>
      <div className="tj-full-chart-box">
         <div className="tj-chart-y-axis">
           <span style={{ top: '10%' }}>{spline.yMax}</span>
           <span style={{ top: '50%' }}>{spline.yMax / 2}</span>
           <span style={{ top: '90%' }}>0</span>
         </div>
         <div className="tj-spline-pro">
           <svg width="100%" height="100%" viewBox="0 0 800 200" preserveAspectRatio="none">
             <line x1="0" y1="20" x2="800" y2="20" stroke="#F1F5F9" strokeWidth="1" vectorEffect="non-scaling-stroke" />
             <line x1="0" y1="100" x2="800" y2="100" stroke="#F1F5F9" strokeWidth="1" vectorEffect="non-scaling-stroke" />
             <line x1="0" y1="180" x2="800" y2="180" stroke="#F1F5F9" strokeWidth="1" vectorEffect="non-scaling-stroke" />
             <path className="area" d={spline.area} vectorEffect="non-scaling-stroke"></path>
             <path className="line" d={spline.line} fill="none" vectorEffect="non-scaling-stroke"></path>
           </svg>
           {/* Chart Points Overlay */}
           {spline.points.map((pt, i) => (
             <div key={i} style={{
               position: 'absolute',
               left: `${(pt[0] / 800) * 100}%`,
               top: `${(pt[1] / 200) * 100}%`,
               width: 8, height: 8,
               backgroundColor: '#fff',
               border: '2px solid #10B981',
               borderRadius: '50%',
               transform: 'translate(-50%, -50%)'
             }}></div>
           ))}
         </div>
         <div className="tj-chart-x-axis">
           <span>Week 1</span>
           <span>Week 2</span>
           <span>Week 3</span>
           <span>Week 4</span>
           <span>Week 5</span>
           <span>Week 6</span>
         </div>
      </div>
    </div>
  )
}
