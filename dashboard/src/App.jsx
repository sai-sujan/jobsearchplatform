import { useEffect, useState } from 'react'
import { NavLink, Navigate, Route, Routes } from 'react-router-dom'
import './App.css'

import AllJobs from './pages/AllJobs'
import AppliedJobs from './pages/AppliedJobs'
import AuthPage from './pages/AuthPage'
import OnboardingPage from './pages/OnboardingPage'
import ProfilePage from './pages/ProfilePage'
import TodaysJobs from './pages/TodaysJobs'
import TrackerBoard from './pages/TrackerBoard'
import { api, storeToken } from './lib/api'
import { APPLIED_STATUSES, normalizeStatus } from './lib/jobs'

const NAV_ICONS = {
  today: (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 3.5v2" />
      <path d="M12 18.5v2" />
      <path d="M4.5 12h2" />
      <path d="M17.5 12h2" />
      <path d="m6.6 6.6 1.4 1.4" />
      <path d="m16 16 1.4 1.4" />
      <path d="m17.4 6.6-1.4 1.4" />
      <path d="m8 16-1.4 1.4" />
      <path d="M12 8.25a3.75 3.75 0 1 1 0 7.5 3.75 3.75 0 0 1 0-7.5Z" />
    </svg>
  ),
  recommended: (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M10.5 18.5a8 8 0 1 0 0-13 8 8 0 0 0 0 13Z" />
      <path d="m16.4 16.4 3.1 3.1" />
    </svg>
  ),
  applied: (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4.5 12.5 19 5.5l-4.4 13-3.1-5-7-1Z" />
      <path d="m11.5 13.5 7.5-8" />
    </svg>
  ),
  tracker: (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M5 5.5h4.5v13H5v-13Z" />
      <path d="M14.5 5.5H19v7h-4.5v-7Z" />
      <path d="M14.5 16H19v2.5h-4.5V16Z" />
    </svg>
  ),
  profile: (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.6 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06A2 2 0 0 1 7.04 4.3l.06.06A1.65 1.65 0 0 0 8.92 4a1.65 1.65 0 0 0 1-1.51V2.4a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9c.18.39.57.64 1 .64H20.5a2 2 0 0 1 0 4h-.09c-.43 0-.82.25-1.01.64Z" />
    </svg>
  ),
  sparkles: (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="m12 3 1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3Z" />
      <path d="m18 15 .8 2.2L21 18l-2.2.8L18 21l-.8-2.2L15 18l2.2-.8L18 15Z" />
    </svg>
  ),
}

function App() {
  const [session, setSession] = useState(null)
  const [onboarding, setOnboarding] = useState(null)
  const [jobs, setJobs] = useState([])
  const [stats, setStats] = useState({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const loadApp = async () => {
    try {
      const sessionResponse = await api.get('/api/v1/auth/me')
      const onboardingResponse = await api.get('/api/onboarding')
      setSession(sessionResponse.data.user)
      setOnboarding(onboardingResponse.data)

      if (onboardingResponse.data.profile?.onboarding_completed) {
        try {
          const jobsResponse = await api.get('/api/jobs')
          setJobs(jobsResponse.data.jobs || [])
          setStats(jobsResponse.data.stats || {})
        } catch (jobsError) {
          if (jobsError.response?.status === 404) {
            setJobs([])
            setStats({ total: 0, good_matches: 0, perfect_matches: 0, last_updated: 'Pending' })
          } else {
            throw jobsError
          }
        }
      } else {
        setJobs([])
        setStats({})
      }

      setError('')
    } catch (requestError) {
      if (requestError.response?.status === 401) {
        storeToken('')
        setSession(null)
        setOnboarding(null)
        setJobs([])
        setStats({})
        setError('')
      } else {
        setError(requestError.response?.data?.detail || requestError.response?.data?.error || 'Unable to load your workspace right now.')
      }
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadApp()
  }, [])

  useEffect(() => {
    if (!session || !onboarding?.profile?.onboarding_completed) return undefined

    const interval = setInterval(async () => {
      try {
        const response = await api.get('/api/jobs')
        setJobs(response.data.jobs || [])
        setStats(response.data.stats || {})
      } catch {
        // Keep background refresh quiet.
      }
    }, 12000)

    return () => clearInterval(interval)
  }, [session, onboarding?.profile?.onboarding_completed])

  const handleStatusChange = async (job, newStatus) => {
    if (!job?.id) return
    setJobs((currentJobs) =>
      currentJobs.map((currentJob) =>
        currentJob.id === job.id ? { ...currentJob, Status: newStatus } : currentJob,
      ),
    )
    try {
      await api.patch(`/api/jobs/${job.id}/status`, null, {
        params: { status: newStatus },
      })
    } catch {
      loadApp()
    }
  }

  const handleDeleteJob = async (job) => {
    if (!job?.id) return
    try {
      await api.delete(`/api/jobs/${job.id}`)
      setJobs((currentJobs) => currentJobs.filter((currentJob) => currentJob.id !== job.id))
    } catch {
      setError('Failed to remove the selected role.')
    }
  }

  const handleLogout = async () => {
    try {
      await api.post('/api/v1/auth/logout')
    } catch {
      // Clear local state even if logout network cleanup fails.
    } finally {
      storeToken('')
      setSession(null)
      setOnboarding(null)
      setJobs([])
      setStats({})
      setError('')
    }
  }

  const recommendedJobs = [...jobs].sort((left, right) => (right['Skill Score'] || 0) - (left['Skill Score'] || 0))
  const appliedCount = jobs.filter((job) => APPLIED_STATUSES.includes(normalizeStatus(job.Status))).length
  const hasMatchedJobs = recommendedJobs.length > 0
  const renderNavCount = (count) => (count > 0 ? <span>{count}</span> : null)

  if (loading) {
    return (
      <div className="app-state-shell">
        <div className="app-state-card">
          <div className="app-spinner" />
          <h1>Loading your workspace</h1>
          <p>Preparing your personalized job feed and profile.</p>
        </div>
      </div>
    )
  }

  if (!session) {
    return <AuthPage onAuthenticated={(user) => { setSession(user); loadApp() }} />
  }

  if (onboarding && !onboarding.profile?.onboarding_completed) {
    return (
      <OnboardingPage
        session={session}
        onboarding={onboarding}
        onUpdated={(nextState) => setOnboarding(nextState)}
        onCompleted={(nextState) => {
          setOnboarding(nextState)
          loadApp()
        }}
      />
    )
  }

  return (
    <div className="app-frame">
      <aside className="app-sidebar">
        <div className="brand-block">
          <span className="brand-mark">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M6.5 7.5h11A2.5 2.5 0 0 1 20 10v7.5A2.5 2.5 0 0 1 17.5 20h-11A2.5 2.5 0 0 1 4 17.5V10a2.5 2.5 0 0 1 2.5-2.5Z" />
              <path d="M9 7.5V5.8A1.8 1.8 0 0 1 10.8 4h2.4A1.8 1.8 0 0 1 15 5.8v1.7" />
              <path d="M9 13.5h6" />
            </svg>
          </span>
          <div>
            <h1>CareerOS</h1>
          </div>
        </div>

        <nav className="topnav" aria-label="Primary navigation">
          <NavLink to="/today" className={({ isActive }) => `topnav-link ${isActive ? 'active' : ''}`}>
            <span className="nav-icon">{NAV_ICONS.today}</span>
            <span className="nav-label">Today</span>
          </NavLink>
          <NavLink to="/jobs" className={({ isActive }) => `topnav-link ${isActive ? 'active' : ''}`}>
            <span className="nav-icon">{NAV_ICONS.recommended}</span>
            <span className="nav-label">All Jobs</span>
            {renderNavCount(recommendedJobs.length)}
          </NavLink>
          <NavLink to="/applied" className={({ isActive }) => `topnav-link ${isActive ? 'active' : ''}`}>
            <span className="nav-icon">{NAV_ICONS.applied}</span>
            <span className="nav-label">Applied</span>
            {renderNavCount(appliedCount)}
          </NavLink>
          <NavLink to="/tracker" className={({ isActive }) => `topnav-link ${isActive ? 'active' : ''}`}>
            <span className="nav-icon">{NAV_ICONS.tracker}</span>
            <span className="nav-label">Tracker</span>
            {renderNavCount(jobs.length)}
          </NavLink>
          <NavLink to="/settings" className={({ isActive }) => `topnav-link ${isActive ? 'active' : ''}`}>
            <span className="nav-icon">{NAV_ICONS.profile}</span>
            <span className="nav-label">Settings</span>
          </NavLink>
        </nav>

        <div className="sidebar-insight">
          <span>{NAV_ICONS.sparkles} AI Resume Tailor</span>
          <p>
            {hasMatchedJobs
              ? `Tailor your resume for ${stats.total || recommendedJobs.length} matched roles.`
              : 'Auto-tailor your resume for each application with AI.'}
          </p>
        </div>

        <div className="topbar-meta">
          <div className="user-avatar">{(session.full_name || session.username || 'U').trim().charAt(0).toUpperCase()}</div>
          <div>
            <span>{session.full_name || session.username}</span>
            <strong>{hasMatchedJobs ? 'Active workspace' : 'Profile ready'}</strong>
          </div>
          <button type="button" className="secondary-action" onClick={handleLogout}>
            Log out
          </button>
        </div>
      </aside>

      <main className="app-main">
        {error && (
          <div className="app-inline-banner">
            {error}
          </div>
        )}

        <Routes>
          <Route path="/" element={<Navigate to="/jobs" replace />} />
          <Route path="/today" element={<TodaysJobs jobs={recommendedJobs} session={session} onStatusChange={handleStatusChange} onDelete={handleDeleteJob} />} />
          <Route path="/jobs" element={<AllJobs jobs={jobs} stats={stats} onStatusChange={handleStatusChange} onDelete={handleDeleteJob} />} />
          <Route path="/applied" element={<AppliedJobs jobs={jobs} onStatusChange={handleStatusChange} onDelete={handleDeleteJob} />} />
          <Route path="/tracker" element={<TrackerBoard jobs={jobs} onStatusChange={handleStatusChange} onDelete={handleDeleteJob} />} />
          <Route
            path="/settings"
            element={(
              <ProfilePage
                onboarding={onboarding}
                onUpdated={(nextState) => {
                  setOnboarding(nextState)
                  if (nextState?.user) {
                    setSession((current) => ({ ...(current || {}), ...nextState.user }))
                  }
                }}
              />
            )}
          />
          <Route path="/profile" element={<Navigate to="/settings" replace />} />
          <Route path="*" element={<Navigate to="/jobs" replace />} />
        </Routes>
      </main>
    </div>
  )
}

export default App
