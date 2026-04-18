import { useEffect, useRef, useState } from 'react'
import { NavLink, Navigate, Route, Routes, useNavigate } from 'react-router-dom'
import './App.css'

import AllJobs from './pages/AllJobs'
import AppliedJobs from './pages/AppliedJobs'
import AuthPage from './pages/AuthPage'
import OnboardingPage from './pages/OnboardingPage'
import ProfilePage from './pages/ProfilePage'
import TailorPage from './pages/TailorPage'
import TodaysJobs from './pages/TodaysJobs'
import TrackerBoard from './pages/TrackerBoard'
import { api, storeToken } from './lib/api'
import { APPLIED_STATUSES, normalizeStatus } from './lib/jobs'
import NotificationToast from './components/NotificationToast'

const NAV_ICONS = {
  today: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 1 1-7.6-11.7 8.38 8.38 0 0 1 3.8.9L21 3.5v8z"/><line x1="12" y1="12" x2="16" y2="16"/></svg>,
  recommended: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="7" width="20" height="14" rx="2" ry="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/></svg>,
  applied: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>,
  tracker: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="9" y1="21" x2="9" y2="9"/></svg>,
  sparkles: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3a9 9 0 1 0 9 9"/><path d="M19 8.08V7c0-2.21-1.79-4-4-4h-4"/><path d="M15 10l-4 4"/><path d="M15 14l-4-4"/></svg>,
  profile: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
}

function App() {
  const navigate = useNavigate()
  const [session, setSession] = useState(null)
  const [onboarding, setOnboarding] = useState(null)
  const [jobs, setJobs] = useState([])
  const [stats, setStats] = useState({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [toast, setToast] = useState(null)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [sidebarSearch, setSidebarSearch] = useState('')
  const sidebarSearchRef = useRef(null)

  const showToast = (message, type = 'success') => {
    setToast({ message, type })
    setTimeout(() => setToast(null), 4000)
  }

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
      showToast(`${normalizeStatus(newStatus).replace('_', ' ')} updated`)
    } catch {
      loadApp()
      showToast('Action failed', 'error')
    }
  }

  const handleNotesChange = async (job, notes) => {
    if (!job?.id) return
    setJobs((currentJobs) =>
      currentJobs.map((currentJob) =>
        currentJob.id === job.id ? { ...currentJob, notes } : currentJob,
      ),
    )
    try {
      await api.patch(`/api/jobs/${job.id}/notes`, null, { params: { notes } })
      showToast('Notes saved')
    } catch {
      showToast('Could not save notes', 'error')
    }
  }

  const handleTailorJob = async (job) => {
    if (!job?.id) {
      showToast('Select a job first', 'error')
      return
    }
    try {
      await api.post(`/api/jobs/${job.id}/tailor`)
      showToast('Tailoring started — check Tailor tab')
    } catch {
      showToast('Tailor request failed', 'error')
    }
  }

  const handleDeleteJob = async (job) => {
    if (!job?.id) return
    try {
      await api.delete(`/api/jobs/${job.id}`)
      setJobs((currentJobs) => currentJobs.filter((currentJob) => currentJob.id !== job.id))
      showToast('Role removed from feed')
    } catch {
      showToast('Failed to remove role', 'error')
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

  const savedSearches = onboarding?.profile?.search_presets || []

  const handleSidebarSearchSubmit = (e) => {
    if (e.key === 'Enter' && sidebarSearch.trim()) {
      navigate(`/jobs?q=${encodeURIComponent(sidebarSearch.trim())}`)
      setSidebarSearch('')
    }
  }

  return (
    <div className={`app-frame${sidebarCollapsed ? ' sidebar-collapsed' : ''}`}>
      {toast && (
        <NotificationToast
          message={toast.message}
          type={toast.type}
          onClose={() => setToast(null)}
        />
      )}

      <aside className="app-sidebar">
        <div className="brand-block">
          <span className="brand-mark">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <rect x="3" y="7" width="18" height="13" rx="2.2" />
              <path d="M8 7V5.5A1.5 1.5 0 0 1 9.5 4h5A1.5 1.5 0 0 1 16 5.5V7" />
              <path d="M3 12h18" />
            </svg>
          </span>
          <div>
            <h1>CareerOS</h1>
          </div>
          <button type="button" className="sidebar-collapse" aria-label="Collapse" title="Collapse sidebar" onClick={() => setSidebarCollapsed((c) => !c)}>
            {sidebarCollapsed ? '›' : '‹'}
          </button>
        </div>

        <label className="sidebar-search">
          <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" /></svg>
          <input
            ref={sidebarSearchRef}
            placeholder="Search jobs… (Enter)"
            value={sidebarSearch}
            onChange={(e) => setSidebarSearch(e.target.value)}
            onKeyDown={handleSidebarSearchSubmit}
          />
        </label>

        <div className="sidebar-section-title">MAIN MENU</div>
        <nav className="topnav" aria-label="Primary navigation">
          <NavLink to="/today" className={({ isActive }) => `topnav-link ${isActive ? 'active' : ''}`}>
            <span className="nav-icon">{NAV_ICONS.today}</span>
            <span className="nav-label">Today Feed</span>
          </NavLink>
          <NavLink to="/jobs" className={({ isActive }) => `topnav-link ${isActive ? 'active' : ''}`}>
            <span className="nav-icon">{NAV_ICONS.recommended}</span>
            <span className="nav-label">All Jobs</span>
            {renderNavCount(recommendedJobs.length)}
          </NavLink>
          <NavLink to="/applied" className={({ isActive }) => `topnav-link ${isActive ? 'active' : ''}`}>
            <span className="nav-icon">{NAV_ICONS.applied}</span>
            <span className="nav-label">Applied Jobs</span>
            {renderNavCount(appliedCount)}
          </NavLink>
          <NavLink to="/tracker" className={({ isActive }) => `topnav-link ${isActive ? 'active' : ''}`}>
            <span className="nav-icon">{NAV_ICONS.tracker}</span>
            <span className="nav-label">Tracker</span>
            {renderNavCount(jobs.length)}
          </NavLink>
        </nav>

        <div className="sidebar-section-title">TOOLS</div>
        <nav className="topnav" aria-label="Tools">
          <NavLink to="/tailor" className={({ isActive }) => `topnav-link ${isActive ? 'active' : ''}`}>
            <span className="nav-icon">{NAV_ICONS.sparkles}</span>
            <span className="nav-label">AI Resume Tailor</span>
          </NavLink>
        </nav>

        <div className="sidebar-section-title sidebar-section-title-row">
          <span>SAVED SEARCHES</span>
          <button type="button" className="sidebar-add" aria-label="Add saved search" onClick={() => navigate('/jobs')}>+</button>
        </div>
        <div className="sidebar-saved">
          {savedSearches.length > 0 ? (
            savedSearches.map((s) => (
              <button
                key={s.id || s.label}
                type="button"
                className="sidebar-saved-item"
                onClick={() => navigate(`/jobs?q=${encodeURIComponent(s.label || s.role || '')}`)}
              >
                <span className="sidebar-saved-dot" style={{ background: '#6366f1' }} />
                <span>{s.label || s.role}</span>
              </button>
            ))
          ) : (
            <p className="sidebar-saved-empty">No saved searches yet.<br />Use All Jobs to search and save.</p>
          )}
        </div>

        <NavLink to="/settings" className="sidebar-settings">
          <span className="nav-icon">{NAV_ICONS.profile}</span>
          <span>Settings</span>
        </NavLink>

        <div className="topbar-meta">
          <div className="user-avatar">{(session.full_name || session.username || 'U').trim().charAt(0).toUpperCase()}</div>
          <div>
            <span>{session.full_name || session.username}</span>
            <strong>Free Plan</strong>
          </div>
          <button type="button" className="secondary-action" onClick={handleLogout}>
            Log out
          </button>
        </div>
      </aside>

      {/* MOBILE NAV (Section 9) */}
      <nav className="mobile-nav" aria-label="Mobile navigation">
        <NavLink to="/today" className={({ isActive }) => `mobile-nav-link ${isActive ? 'active' : ''}`}>
          <span className="nav-icon">{NAV_ICONS.today}</span>
          <span>Today</span>
        </NavLink>
        <NavLink to="/jobs" className={({ isActive }) => `mobile-nav-link ${isActive ? 'active' : ''}`}>
          <span className="nav-icon">{NAV_ICONS.recommended}</span>
          <span>Feed</span>
          {renderNavCount(recommendedJobs.length)}
        </NavLink>
        <NavLink to="/tracker" className={({ isActive }) => `mobile-nav-link ${isActive ? 'active' : ''}`}>
          <span className="nav-icon">{NAV_ICONS.tracker}</span>
          <span>Board</span>
          {renderNavCount(jobs.length)}
        </NavLink>
        <NavLink to="/tailor" className={({ isActive }) => `mobile-nav-link ${isActive ? 'active' : ''}`}>
          <span className="nav-icon">{NAV_ICONS.sparkles}</span>
          <span>Tailor</span>
        </NavLink>
      </nav>

      <main className="app-main">
        {error && (
          <div className="app-inline-banner">
            {error}
          </div>
        )}

        <Routes>
          <Route path="/" element={<Navigate to="/jobs" replace />} />
          <Route path="/today" element={<TodaysJobs jobs={recommendedJobs} session={session} onStatusChange={handleStatusChange} onDelete={handleDeleteJob} />} />
          <Route path="/jobs" element={<AllJobs jobs={jobs} stats={stats} onStatusChange={handleStatusChange} onDelete={handleDeleteJob} onNotesChange={handleNotesChange} onTailor={handleTailorJob} />} />
          <Route path="/applied" element={<AppliedJobs jobs={jobs} session={session} onStatusChange={handleStatusChange} onDelete={handleDeleteJob} />} />
          <Route path="/tracker" element={<TrackerBoard jobs={jobs} onStatusChange={handleStatusChange} onDelete={handleDeleteJob} />} />
          <Route path="/tailor" element={<TailorPage jobs={jobs} onNotesChange={handleNotesChange} onboarding={onboarding} />} />
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
