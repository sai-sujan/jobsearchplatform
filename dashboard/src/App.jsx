import { useState, useEffect } from 'react'
import axios from 'axios'
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  ArcElement,
  Title,
  Tooltip,
  Legend,
} from 'chart.js'
import { Bar, Doughnut } from 'react-chartjs-2'
import './App.css'
import JobSidebar from './components/JobSidebar'

ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  ArcElement,
  Title,
  Tooltip,
  Legend
)

const API_URL = 'http://localhost:5001'

function App() {
  const [jobs, setJobs] = useState([])
  const [filteredJobs, setFilteredJobs] = useState([])
  const [stats, setStats] = useState({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [lastModified, setLastModified] = useState(null)

  // Sidebar state
  const [selectedJob, setSelectedJob] = useState(null)
  const [sidebarOpen, setSidebarOpen] = useState(false)

  // Filters
  const [tierFilter, setTierFilter] = useState('all')
  const [minScore, setMinScore] = useState(0)
  const [searchText, setSearchText] = useState('')
  const [showNewOnly, setShowNewOnly] = useState(false)
  const [filterDate, setFilterDate] = useState('')
  const [filterTime, setFilterTime] = useState('')
  const [roleFilter, setRoleFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('all')



  // Fetch jobs from API
  const fetchJobs = async () => {
    try {
      const response = await axios.get(`${API_URL}/api/jobs`)
      setJobs(response.data.jobs)
      setFilteredJobs(response.data.jobs)
      setStats(response.data.stats)
      setLastModified(response.data.last_modified)
      setLoading(false)
      setError(null)


    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load jobs. Make sure the API is running.')
      setLoading(false)
    }
  }

  // Auto-refresh when Excel file changes
  useEffect(() => {
    fetchJobs()

    // Poll for changes every 5 seconds
    const interval = setInterval(async () => {
      try {
        const response = await axios.get(`${API_URL}/api/jobs`)
        if (response.data.last_modified !== lastModified) {
          console.log('Excel file updated, refreshing data...')
          setJobs(response.data.jobs)
          setFilteredJobs(response.data.jobs)
          setStats(response.data.stats)
          setLastModified(response.data.last_modified)
        }
      } catch (err) {
        console.error('Auto-refresh error:', err)
      }
    }, 5000)

    return () => clearInterval(interval)
  }, [lastModified])

  // Apply filters
  useEffect(() => {
    let filtered = jobs.filter(job => {
      // New jobs filter
      if (showNewOnly && job.New !== '✨ NEW') return false

      // Role filter
      if (roleFilter !== 'all') {
        const searchQuery = (job['Search Query'] || '').toLowerCase()
        if (roleFilter === 'ai' && !searchQuery.includes('ai engineer')) return false
        if (roleFilter === 'ml' && !searchQuery.includes('ml engineer')) return false
        if (roleFilter === 'ds' && !searchQuery.includes('data scientist')) return false
      }

      // Status filter
      if (statusFilter !== 'all') {
        const jobStatus = job.Status || 'not_applied'
        if (statusFilter !== jobStatus) return false
      }

      // Tier filter
      if (tierFilter !== 'all') {
        const tier = job.Tier || ''
        if (tierFilter === 'perfect' && !tier.includes('🟢')) return false
        if (tierFilter === 'good' && !tier.includes('🟡')) return false
        if (tierFilter === 'stretch' && !tier.includes('🟠')) return false
        if (tierFilter === 'skip' && !tier.includes('🔴')) return false
      }

      // Score filter
      if ((job['Skill Score'] || 0) < minScore) return false

      // Search filter
      if (searchText) {
        const title = (job.Title || '').toLowerCase()
        const company = (job.Company || '').toLowerCase()
        const skills = (job['Matched Skills'] || '').toLowerCase()
        if (!title.includes(searchText.toLowerCase()) &&
          !company.includes(searchText.toLowerCase()) &&
          !skills.includes(searchText.toLowerCase())) {
          return false
        }
      }

      return true
    })

    setFilteredJobs(filtered)
  }, [jobs, tierFilter, minScore, searchText, showNewOnly, filterDate, filterTime, roleFilter, statusFilter])

  // Handle status change
  const handleStatusChange = async (job, newStatus) => {
    // Optimistic update
    const updatedJobs = jobs.map(j =>
      j._rowIndex === job._rowIndex ? { ...j, Status: newStatus } : j
    )
    setJobs(updatedJobs)
    setFilteredJobs(updatedJobs) // Re-apply filters ideally, but this updates the view

    // Update backend
    try {
      await axios.post(`${API_URL}/api/update-status`, {
        row_index: job._rowIndex,
        status: newStatus
      })
    } catch (err) {
      console.error('Failed to update status:', err)
      // Revert on error (optional, skipping for now)
    }
  }

  // Handle job card click to open sidebar
  const handleJobClick = (job) => {
    setSelectedJob(job)
    setSidebarOpen(true)
  }

  // Handle sidebar close
  const handleCloseSidebar = () => {
    setSidebarOpen(false)
    setTimeout(() => setSelectedJob(null), 300) // Wait for animation
  }

  // Get unique dates and times from jobs
  const uniqueDates = [...new Set(jobs.map(j => {
    if (j['Date Found']) {
      const date = new Date(j['Date Found'])
      return date.toISOString().split('T')[0] // YYYY-MM-DD format
    }
    return null
  }).filter(Boolean))].sort().reverse()

  const uniqueTimes = [...new Set(jobs.map(j => {
    if (j['Date Found']) {
      const date = new Date(j['Date Found'])
      return date.toTimeString().slice(0, 5) // HH:MM format
    }
    return null
  }).filter(Boolean))].sort().reverse()

  // Chart data - always shows ALL jobs (not filtered)
  const scoreChartData = {
    labels: ['0-30%', '30-50%', '50-70%', '70-90%', '90-100%'],
    datasets: [{
      label: 'Number of Jobs',
      data: [
        jobs.filter(j => (j['Skill Score'] || 0) < 30).length,
        jobs.filter(j => (j['Skill Score'] || 0) >= 30 && (j['Skill Score'] || 0) < 50).length,
        jobs.filter(j => (j['Skill Score'] || 0) >= 50 && (j['Skill Score'] || 0) < 70).length,
        jobs.filter(j => (j['Skill Score'] || 0) >= 70 && (j['Skill Score'] || 0) < 90).length,
        jobs.filter(j => (j['Skill Score'] || 0) >= 90).length,
      ],
      backgroundColor: [
        'rgba(239, 68, 68, 0.8)',
        'rgba(251, 146, 60, 0.8)',
        'rgba(245, 158, 11, 0.8)',
        'rgba(34, 197, 94, 0.8)',
        'rgba(16, 185, 129, 0.8)',
      ],
      borderRadius: 8,
    }]
  }

  const tierChartData = {
    labels: ['Perfect', 'Good', 'Stretch', 'Skip'],
    datasets: [{
      data: [
        jobs.filter(j => (j.Tier || '').includes('🟢')).length,
        jobs.filter(j => (j.Tier || '').includes('🟡')).length,
        jobs.filter(j => (j.Tier || '').includes('🟠')).length,
        jobs.filter(j => (j.Tier || '').includes('🔴')).length,
      ],
      backgroundColor: [
        'rgba(16, 185, 129, 0.8)',
        'rgba(245, 158, 11, 0.8)',
        'rgba(251, 146, 60, 0.8)',
        'rgba(239, 68, 68, 0.8)',
      ],
    }]
  }

  if (loading) {
    return (
      <div className="loading">
        <div className="spinner"></div>
        <p>Loading jobs...</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="error">
        <h2>❌ Error</h2>
        <p>{error}</p>
        <p>Make sure to run: <code>python dashboard_api.py</code></p>
      </div>
    )
  }

  // Calculate application stats by tier
  const tierStats = {
    perfect: { total: 0, applied: 0, interviewing: 0, accepted: 0 },
    good: { total: 0, applied: 0, interviewing: 0, accepted: 0 },
    stretch: { total: 0, applied: 0, interviewing: 0, accepted: 0 },
    skip: { total: 0, applied: 0, interviewing: 0, accepted: 0 }
  }

  jobs.forEach(job => {
    const tier = job.Tier || ''
    const status = job.Status || 'not_applied'

    let tierKey = null
    if (tier.includes('🟢')) tierKey = 'perfect'
    else if (tier.includes('🟡')) tierKey = 'good'
    else if (tier.includes('🟠')) tierKey = 'stretch'
    else if (tier.includes('🔴')) tierKey = 'skip'

    if (tierKey) {
      tierStats[tierKey].total++
      if (status === 'applied') tierStats[tierKey].applied++
      if (status === 'interviewing') tierStats[tierKey].interviewing++
      if (status === 'accepted') tierStats[tierKey].accepted++
    }
  })

  // Handle sidebar navigation
  const handleNextJob = () => {
    if (!selectedJob) return
    const currentIndex = filteredJobs.findIndex(j => j._rowIndex === selectedJob._rowIndex)
    if (currentIndex !== -1 && currentIndex < filteredJobs.length - 1) {
      setSelectedJob(filteredJobs[currentIndex + 1])
    }
  }

  const handlePrevJob = () => {
    if (!selectedJob) return
    const currentIndex = filteredJobs.findIndex(j => j._rowIndex === selectedJob._rowIndex)
    if (currentIndex > 0) {
      setSelectedJob(filteredJobs[currentIndex - 1])
    }
  }

  const selectedJobIndex = selectedJob ? filteredJobs.findIndex(j => j._rowIndex === selectedJob._rowIndex) : -1
  const hasNext = selectedJobIndex !== -1 && selectedJobIndex < filteredJobs.length - 1
  const hasPrev = selectedJobIndex > 0

  return (
    <div className="app">
      <header className="header">
        <h1>🎯 Job Search Dashboard</h1>
        <p className="subtitle">Auto-refreshes when Excel changes</p>
        {stats.last_updated && (
          <p className="last-updated">Last updated: {stats.last_updated}</p>
        )}
      </header>

      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-label">Total Jobs</div>
          <div className="stat-value">{stats.total || 0}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Good Matches (70%+)</div>
          <div className="stat-value">{stats.good_matches || 0}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Perfect Matches (90%+)</div>
          <div className="stat-value">{stats.perfect_matches || 0}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Passed Filters</div>
          <div className="stat-value">{stats.yes_verdict || 0}</div>
        </div>
      </div>

      <div className="stats-grid" style={{ marginTop: '20px' }}>
        <div className="stat-card" style={{ borderLeft: '4px solid #22c55e' }}>
          <div className="stat-label">🟢 Perfect Match</div>
          <div className="stat-value" style={{ fontSize: '1.5rem' }}>
            {tierStats.perfect.applied + tierStats.perfect.interviewing + tierStats.perfect.accepted}/{tierStats.perfect.total}
          </div>
          <div style={{ fontSize: '0.75rem', color: '#6b7280', marginTop: '6px' }}>
            ✅ {tierStats.perfect.applied} • 💬 {tierStats.perfect.interviewing} • 🎉 {tierStats.perfect.accepted}
          </div>
        </div>
        <div className="stat-card" style={{ borderLeft: '4px solid #eab308' }}>
          <div className="stat-label">🟡 Good Match</div>
          <div className="stat-value" style={{ fontSize: '1.5rem' }}>
            {tierStats.good.applied + tierStats.good.interviewing + tierStats.good.accepted}/{tierStats.good.total}
          </div>
          <div style={{ fontSize: '0.75rem', color: '#6b7280', marginTop: '6px' }}>
            ✅ {tierStats.good.applied} • 💬 {tierStats.good.interviewing} • 🎉 {tierStats.good.accepted}
          </div>
        </div>
        <div className="stat-card" style={{ borderLeft: '4px solid #f97316' }}>
          <div className="stat-label">🟠 Stretch Goal</div>
          <div className="stat-value" style={{ fontSize: '1.5rem' }}>
            {tierStats.stretch.applied + tierStats.stretch.interviewing + tierStats.stretch.accepted}/{tierStats.stretch.total}
          </div>
          <div style={{ fontSize: '0.75rem', color: '#6b7280', marginTop: '6px' }}>
            ✅ {tierStats.stretch.applied} • 💬 {tierStats.stretch.interviewing} • 🎉 {tierStats.stretch.accepted}
          </div>
        </div>
        <div className="stat-card" style={{ borderLeft: '4px solid #ef4444' }}>
          <div className="stat-label">🔴 Skip</div>
          <div className="stat-value" style={{ fontSize: '1.5rem' }}>
            {tierStats.skip.applied + tierStats.skip.interviewing + tierStats.skip.accepted}/{tierStats.skip.total}
          </div>
          <div style={{ fontSize: '0.75rem', color: '#6b7280', marginTop: '6px' }}>
            ✅ {tierStats.skip.applied} • 💬 {tierStats.skip.interviewing} • 🎉 {tierStats.skip.accepted}
          </div>
        </div>
      </div>

      <div className="charts-grid">
        <div className="chart-card">
          <h3>Skill Score Distribution</h3>
          <Bar data={scoreChartData} options={{ responsive: true, plugins: { legend: { display: false } } }} />
        </div>
      </div>

      <div className="filters">
        <div className="filter-group">
          <label>Filter by Role</label>
          <select value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)}>
            <option value="all">All Roles</option>
            <option value="ai">🤖 AI Engineer</option>
            <option value="ml">🧠 ML Engineer</option>
            <option value="ds">📊 Data Scientist</option>
          </select>
        </div>
        <div className="filter-group">
          <label>Application Status</label>
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="all">All Status</option>
            <option value="not_applied">❌ Not Yet Applied</option>
            <option value="applied">✅ Applied</option>
            <option value="interviewing">💬 Interviewing</option>
            <option value="accepted">🎉 Accepted</option>
          </select>
        </div>
        <div className="filter-group">
          <label>Filter by Tier</label>
          <select value={tierFilter} onChange={(e) => setTierFilter(e.target.value)}>
            <option value="all">All Tiers</option>
            <option value="perfect">🟢 Perfect Match</option>
            <option value="good">🟡 Good Match</option>
            <option value="stretch">🟠 Stretch Goal</option>
            <option value="skip">🔴 Skip</option>
          </select>
        </div>
        <div className="filter-group">
          <label>Minimum Score</label>
          <input
            type="number"
            value={minScore}
            onChange={(e) => setMinScore(Number(e.target.value))}
            min="0"
            max="100"
            placeholder="0"
          />
        </div>
        <div className="filter-group">
          <label>Search</label>
          <input
            type="text"
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            placeholder="Search jobs..."
          />
        </div>
        <div className="filter-group">
          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={showNewOnly}
              onChange={(e) => setShowNewOnly(e.target.checked)}
              style={{ width: '18px', height: '18px', cursor: 'pointer' }}
            />
            <span>✨ New Jobs Only</span>
          </label>
        </div>
        <div className="filter-group">
          <label>Filter by Date</label>
          <select
            value={filterDate}
            onChange={(e) => setFilterDate(e.target.value)}
          >
            <option value="">All Dates</option>
            {uniqueDates.map(date => (
              <option key={date} value={date}>
                {new Date(date + 'T00:00:00').toLocaleDateString('en-US', {
                  month: 'short',
                  day: 'numeric',
                  year: 'numeric'
                })}
              </option>
            ))}
          </select>
        </div>
        <div className="filter-group">
          <label>Filter by Time</label>
          <input
            type="time"
            value={filterTime}
            onChange={(e) => setFilterTime(e.target.value)}
          />
        </div>
      </div>

      <div className={`jobs-grid ${sidebarOpen ? 'sidebar-open' : ''}`}>
        {filteredJobs.length === 0 ? (
          <p className="no-jobs">No jobs match your filters</p>
        ) : (
          filteredJobs.map((job, index) => {
            const tier = job.Tier || ''
            let cardClass = 'job-card'
            if (tier.includes('🟢')) cardClass += ' perfect'
            else if (tier.includes('🟡')) cardClass += ' good'
            else if (tier.includes('🔴')) cardClass += ' skip'

            const matchedSkills = (job['Matched Skills'] || '').split(',').slice(0, 3).filter(s => s.trim())
            const isNew = job.New === '✨ NEW'

            return (
              <div
                key={index}
                className={cardClass}
                onClick={() => handleJobClick(job)}
                style={{ cursor: 'pointer' }}
              >
                <div className="job-header">
                  <div>
                    <h3 className="job-title">{job.Title || 'Unknown'}</h3>
                    <p className="job-company">{job.Company || 'Unknown'}</p>
                  </div>
                  <div className="score-badge">{job['Skill Score'] || 0}%</div>
                </div>
                <div className="job-meta">
                  {isNew && <span className="new-badge">✨ NEW</span>}
                  <span className="meta-tag">{job.Match || '0/0'} skills</span>
                  <span className="meta-tag">{job.Location || 'Remote'}</span>
                </div>
                {matchedSkills.length > 0 && (
                  <div className="skills-section">
                    <p className="skills-label">Matched Skills:</p>
                    <div className="skills-list">
                      {matchedSkills.map((skill, i) => (
                        <span key={i} className="skill-tag">{skill.trim()}</span>
                      ))}
                    </div>
                  </div>
                )}
                <div style={{ marginTop: '12px', paddingTop: '12px', borderTop: '1px solid #e5e7eb' }}>
                  <label style={{ fontSize: '0.8rem', color: '#6b7280', marginBottom: '6px', display: 'block', fontWeight: 500 }}>
                    Status:
                  </label>
                  <select
                    value={job.Status || 'not_applied'}
                    onChange={(e) => {
                      e.stopPropagation()
                      handleStatusChange(job, e.target.value)
                    }}
                    onClick={(e) => e.stopPropagation()}
                    className="status-select"
                  >
                    <option value="not_applied">❌ Not Applied</option>
                    <option value="applied">✅ Applied</option>
                    <option value="interviewing">💬 Interviewing</option>
                    <option value="accepted">🎉 Accepted</option>
                  </select>
                </div>
                <a href={job.Link || '#'} target="_blank" rel="noopener noreferrer" className="job-link">
                  View Job →
                </a>
              </div>
            )
          })
        )}
      </div>

      {/* Sidebar */}
      {sidebarOpen && (
        <JobSidebar
          job={selectedJob}
          onClose={handleCloseSidebar}
          onStatusChange={handleStatusChange}
          onNext={handleNextJob}
          onPrev={handlePrevJob}
          hasNext={hasNext}
          hasPrev={hasPrev}
        />
      )}
    </div>
  )
}

export default App
