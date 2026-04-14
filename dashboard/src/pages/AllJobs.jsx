import { useMemo, useState } from 'react'
import {
  BarElement,
  CategoryScale,
  Chart as ChartJS,
  Legend,
  LinearScale,
  Title,
  Tooltip,
} from 'chart.js'
import { Bar } from 'react-chartjs-2'
import JobCard from '../components/JobCard'
import JobSidebar from '../components/JobSidebar'
import { api } from '../lib/api'
import { formatDisplayDateTime, getJobId, getTierVariant, normalizeStatus } from '../lib/jobs'
import './AllJobs.css'

ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend)

const STATUS_FILTERS = ['all', 'not_applied', 'skipped', 'applied', 'interviewing', 'accepted']

const ROLE_FILTERS = [
  { value: 'all', label: 'All searches' },
  { value: 'ai', label: 'AI' },
  { value: 'ml', label: 'ML' },
  { value: 'ds', label: 'Data Science' },
]

function matchesRoleFilter(job, filter) {
  const query = (job['Search Query'] || '').toLowerCase()
  if (filter === 'all') return true
  if (filter === 'ai') return query.includes('ai engineer')
  if (filter === 'ml') return query.includes('ml engineer')
  if (filter === 'ds') return query.includes('data scientist')
  return true
}

const AllJobs = ({ jobs, stats, onStatusChange, onDelete }) => {
  const [selectedJob, setSelectedJob] = useState(null)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [searchText, setSearchText] = useState('')
  const [minScore, setMinScore] = useState(0)
  const [statusFilter, setStatusFilter] = useState('all')
  const [roleFilter, setRoleFilter] = useState('all')
  const [specialOnly, setSpecialOnly] = useState(false)
  const [backupState, setBackupState] = useState({ loading: false, message: '' })

  const filteredJobs = useMemo(() => {
    return jobs.filter((job) => {
      if (specialOnly && !job['Special Interest']) return false
      if ((job['Skill Score'] || 0) < minScore) return false
      if (statusFilter !== 'all' && normalizeStatus(job.Status) !== statusFilter) return false
      if (!matchesRoleFilter(job, roleFilter)) return false

      const text = searchText.trim().toLowerCase()
      if (!text) return true

      return [
        job.Title,
        job.Company,
        job.Location,
        job['Matched Skills'],
        job['Search Query'],
      ]
        .join(' ')
        .toLowerCase()
        .includes(text)
    })
  }, [jobs, minScore, roleFilter, searchText, specialOnly, statusFilter])

  const scoreChartData = {
    labels: ['0-30', '31-50', '51-70', '71-90', '91-100'],
    datasets: [
      {
        label: 'Jobs',
        data: [
          jobs.filter((job) => (job['Skill Score'] || 0) <= 30).length,
          jobs.filter((job) => (job['Skill Score'] || 0) > 30 && (job['Skill Score'] || 0) <= 50).length,
          jobs.filter((job) => (job['Skill Score'] || 0) > 50 && (job['Skill Score'] || 0) <= 70).length,
          jobs.filter((job) => (job['Skill Score'] || 0) > 70 && (job['Skill Score'] || 0) <= 90).length,
          jobs.filter((job) => (job['Skill Score'] || 0) > 90).length,
        ],
        backgroundColor: ['#e2e8f0', '#cbd5e1', '#93c5fd', '#60a5fa', '#2563eb'],
        borderRadius: 999,
      },
    ],
  }

  const tierBreakdown = jobs.reduce(
    (accumulator, job) => {
      accumulator[getTierVariant(job)] = (accumulator[getTierVariant(job)] || 0) + 1
      return accumulator
    },
    { perfect: 0, good: 0, stretch: 0, skip: 0, neutral: 0 },
  )

  const selectedIndex = selectedJob
    ? filteredJobs.findIndex((job) => getJobId(job) === getJobId(selectedJob))
    : -1
  const hasPrev = selectedIndex > 0
  const hasNext = selectedIndex !== -1 && selectedIndex < filteredJobs.length - 1

  const handleBackup = async () => {
    try {
      setBackupState({ loading: true, message: '' })
      const response = await api.post('/api/backup')
      setBackupState({ loading: false, message: response.data.message || 'Backup created.' })
    } catch (error) {
      setBackupState({
        loading: false,
        message: error.response?.data?.detail || 'Backup failed. Please try again.',
      })
    }
  }

  return (
    <section className="page-shell">
      <header className="section-hero">
        <div>
          <span className="eyebrow">Operations view</span>
          <h1>Search performance, fit quality, and action queue in one place.</h1>
          <p>
            Last sync {stats.last_updated ? formatDisplayDateTime(stats.last_updated) : 'not available'}.
            Filter the full dataset, save a backup, and jump into any job without losing context.
          </p>
        </div>

        <div className="hero-actions">
          <button className="primary-action" onClick={handleBackup} disabled={backupState.loading}>
            {backupState.loading ? 'Saving backup...' : 'Create backup'}
          </button>
          {backupState.message && <p className="hero-action-message">{backupState.message}</p>}
        </div>
      </header>

      <section className="analytics-grid">
        <div className="analytics-panel analytics-kpis">
          <div className="kpi">
            <span>Total roles</span>
            <strong>{stats.total || jobs.length}</strong>
          </div>
          <div className="kpi">
            <span>Good fit</span>
            <strong>{stats.good_matches || 0}</strong>
          </div>
          <div className="kpi">
            <span>Excellent fit</span>
            <strong>{stats.perfect_matches || 0}</strong>
          </div>
          <div className="kpi">
            <span>Filtered view</span>
            <strong>{filteredJobs.length}</strong>
          </div>
        </div>

        <div className="analytics-panel chart-panel">
          <div className="panel-heading">
            <h2>Score spread</h2>
            <p>How the current dataset distributes across match quality.</p>
          </div>
          <div className="chart-wrap">
            <Bar
              data={scoreChartData}
              options={{
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { display: false } },
                scales: {
                  x: { grid: { display: false } },
                  y: { beginAtZero: true, ticks: { precision: 0 } },
                },
              }}
            />
          </div>
        </div>

        <div className="analytics-panel">
          <div className="panel-heading">
            <h2>Tier mix</h2>
            <p>High-level quality view of the current search results.</p>
          </div>
          <div className="tier-list">
            <div><span>Perfect</span><strong>{tierBreakdown.perfect}</strong></div>
            <div><span>Good</span><strong>{tierBreakdown.good}</strong></div>
            <div><span>Stretch</span><strong>{tierBreakdown.stretch}</strong></div>
            <div><span>Skip</span><strong>{tierBreakdown.skip}</strong></div>
          </div>
        </div>
      </section>

      <section className="filter-bar">
        <label>
          <span>Search</span>
          <input
            value={searchText}
            onChange={(event) => setSearchText(event.target.value)}
            placeholder="Title, company, skill, location..."
          />
        </label>
        <label>
          <span>Minimum match</span>
          <input
            type="range"
            min="0"
            max="100"
            value={minScore}
            onChange={(event) => setMinScore(Number(event.target.value))}
          />
          <small>{minScore}%+</small>
        </label>
        <label>
          <span>Status</span>
          <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
            {STATUS_FILTERS.map((filter) => (
              <option key={filter} value={filter}>
                {filter.replace('_', ' ')}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>Search type</span>
          <select value={roleFilter} onChange={(event) => setRoleFilter(event.target.value)}>
            {ROLE_FILTERS.map((filter) => (
              <option key={filter.value} value={filter.value}>
                {filter.label}
              </option>
            ))}
          </select>
        </label>
        <label className="checkbox-row">
          <input
            type="checkbox"
            checked={specialOnly}
            onChange={(event) => setSpecialOnly(event.target.checked)}
          />
          <span>Only special-interest roles</span>
        </label>
      </section>

      <div className={`job-board ${sidebarOpen ? 'with-sidebar' : ''}`}>
        {filteredJobs.map((job) => (
          <JobCard
            key={getJobId(job)}
            job={job}
            onClick={(nextJob) => {
              setSelectedJob(nextJob)
              setSidebarOpen(true)
            }}
            onStatusChange={onStatusChange}
          />
        ))}
      </div>

      {filteredJobs.length === 0 && (
        <div className="empty-state">
          <span className="empty-state-icon">No matching jobs</span>
          <h2>These filters are too narrow for the current dataset.</h2>
          <p>Reset the search text or reduce the minimum match threshold to broaden the result set.</p>
        </div>
      )}

      {sidebarOpen && (
        <JobSidebar
          job={selectedJob}
          onClose={() => {
            setSidebarOpen(false)
            setTimeout(() => setSelectedJob(null), 250)
          }}
          onStatusChange={onStatusChange}
          onDelete={onDelete}
          onPrev={() => hasPrev && setSelectedJob(filteredJobs[selectedIndex - 1])}
          onNext={() => hasNext && setSelectedJob(filteredJobs[selectedIndex + 1])}
          hasPrev={hasPrev}
          hasNext={hasNext}
        />
      )}
    </section>
  )
}

export default AllJobs
