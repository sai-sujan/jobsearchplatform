import { useEffect, useState } from 'react'
import { NavLink, Navigate, Route, Routes } from 'react-router-dom'
import './App.css'

import AppliedJobs from './pages/AppliedJobs'
import AuthPage from './pages/AuthPage'
import OnboardingPage from './pages/OnboardingPage'
import ProfilePage from './pages/ProfilePage'
import TodaysJobs from './pages/TodaysJobs'
import TrackerBoard from './pages/TrackerBoard'
import { api, storeToken } from './lib/api'
import { APPLIED_STATUSES, normalizeStatus } from './lib/jobs'

const NAV_ICONS = {
  recommended: (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M5 6.5A2.5 2.5 0 0 1 7.5 4h9A2.5 2.5 0 0 1 19 6.5v11A2.5 2.5 0 0 1 16.5 20h-9A2.5 2.5 0 0 1 5 17.5v-11Z" />
      <path d="m8.5 12 2.2 2.2 4.8-5.1" />
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
      <path d="M12 12.5a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z" />
      <path d="M5.5 20a6.5 6.5 0 0 1 13 0" />
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
          <span className="brand-mark">JA</span>
          <div>
            <p className="brand-kicker">Career workspace</p>
            <h1>JobMatch</h1>
          </div>
        </div>

        <nav className="topnav" aria-label="Primary navigation">
          <NavLink to="/jobs" className={({ isActive }) => `topnav-link ${isActive ? 'active' : ''}`}>
            <span className="nav-icon">{NAV_ICONS.recommended}</span>
            <span className="nav-label">Recommended</span>
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
          <NavLink to="/profile" className={({ isActive }) => `topnav-link ${isActive ? 'active' : ''}`}>
            <span className="nav-icon">{NAV_ICONS.profile}</span>
            <span className="nav-label">Profile</span>
          </NavLink>
        </nav>

        <div className="sidebar-insight">
          <span>Matched feed</span>
          <p>
            {hasMatchedJobs
              ? `${stats.total || recommendedJobs.length} roles are ready for review.`
              : 'Your profile is ready. We are preparing your first matched roles.'}
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
          <Route path="/jobs" element={<TodaysJobs jobs={recommendedJobs} onStatusChange={handleStatusChange} onDelete={handleDeleteJob} />} />
          <Route path="/applied" element={<AppliedJobs jobs={jobs} onStatusChange={handleStatusChange} onDelete={handleDeleteJob} />} />
          <Route path="/tracker" element={<TrackerBoard jobs={jobs} onStatusChange={handleStatusChange} onDelete={handleDeleteJob} />} />
          <Route
            path="/profile"
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
          <Route path="*" element={<Navigate to="/jobs" replace />} />
        </Routes>
      </main>
    </div>
  )
}

export default App
