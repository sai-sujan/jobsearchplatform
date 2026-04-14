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
        const jobsResponse = await api.get('/api/jobs')
        setJobs(jobsResponse.data.jobs || [])
        setStats(jobsResponse.data.stats || {})
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
      <header className="topbar">
        <div className="brand-block">
          <span className="brand-mark">JA</span>
          <div>
            <p className="brand-kicker">Matched opportunities</p>
            <h1>Only the jobs that fit your profile.</h1>
          </div>
        </div>

        <nav className="topnav">
          <NavLink to="/jobs" className={({ isActive }) => `topnav-link ${isActive ? 'active' : ''}`}>
            Recommended
            <span>{recommendedJobs.length}</span>
          </NavLink>
          <NavLink to="/applied" className={({ isActive }) => `topnav-link ${isActive ? 'active' : ''}`}>
            Applied
            <span>{appliedCount}</span>
          </NavLink>
          <NavLink to="/tracker" className={({ isActive }) => `topnav-link ${isActive ? 'active' : ''}`}>
            Tracker
            <span>{jobs.length}</span>
          </NavLink>
          <NavLink to="/profile" className={({ isActive }) => `topnav-link ${isActive ? 'active' : ''}`}>
            Profile
          </NavLink>
        </nav>

        <div className="topbar-meta">
          <span>{session.full_name || session.username}</span>
          <strong>{stats.total ? `${stats.total} matched roles` : 'Waiting for matched jobs'}</strong>
          <button type="button" className="secondary-action" onClick={handleLogout}>
            Log out
          </button>
        </div>
      </header>

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
