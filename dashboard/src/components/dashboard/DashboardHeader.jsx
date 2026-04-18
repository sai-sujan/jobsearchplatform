import React from 'react'
import { CalendarIcon, BellIcon } from '../icons/DashboardIcons'

const DashboardHeader = ({ todayStr, onLogApplication }) => {
  return (
    <header className="tj-header-focus">
      <div className="tj-header-left">
        <h1 className="tj-focus-title">Today's Focus</h1>
      </div>
      <div className="tj-header-right">
        <div className="tj-date-display">
          <CalendarIcon />
          <span>{todayStr}</span>
        </div>
        <button className="tj-btn-primary" onClick={onLogApplication}>
          <span>+</span> Log Application
        </button>
      </div>
    </header>
  )
}

export default DashboardHeader
