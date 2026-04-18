import React, { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import JobSidebar from '../components/JobSidebar'
import { getDisplayMatchScore, getJobId, normalizeStatus } from '../lib/jobs'
import { getAppliedDate, daysSince, buildSplinePath } from '../lib/dashboardUtils'
import { useJobs, useNotifications } from '../hooks/useDashboardData'

import DashboardHeader from '../components/dashboard/DashboardHeader'
import { ActionCards } from '../components/dashboard/ActionCards'
import { PipelineStats } from '../components/dashboard/PipelineStats'
import { PriorityFollowUps } from '../components/dashboard/PriorityFollowUps'
import { ActivityChart } from '../components/dashboard/ActivityChart'
import { JobRecommendations } from '../components/dashboard/JobRecommendations'
import './TodaysJobs.css'

const TodaysJobs = ({ session, onStatusChange, onDelete }) => {
  const navigate = useNavigate()
  const [selectedJob, setSelectedJob] = useState(null)
  const [sidebarOpen, setSidebarOpen] = useState(false)

  // 1. DATA ACCESS (Llama-3 API Core)
  const userId = session?.user?.id || '00000000-0000-0000-0000-000000000000';
  const { data: jobs = [], isLoading: jobsLoading } = useJobs(userId);
  const { data: notifications = [], isLoading: notificationsLoading } = useNotifications(userId);

  // 2. DATA AGGREGATION & PIPELINE HOOKS
  const rankedJobs = useMemo(
    () => [...jobs].filter(j => normalizeStatus(j.user_status) !== 'rejected').sort((left, right) => (right.fit_score || 0) - (left.fit_score || 0)),
    [jobs],
  )

  const topMatches = rankedJobs.slice(0, 3)

  const appliedCount = jobs.filter((job) => normalizeStatus(job.user_status) === 'applied').length
  const interviewingCount = jobs.filter((job) => normalizeStatus(job.user_status) === 'interviewing').length
  const offersCount = jobs.filter((job) => normalizeStatus(job.user_status) === 'accepted').length
  const screeningCount = jobs.filter((job) => { const s = normalizeStatus(job.user_status); return s === 'screening' || s === 'technical' }).length

  // Priority follow-up calculations
  const priorityFollowUps = useMemo(() => {
    return jobs
      .filter(j => normalizeStatus(j.user_status) === 'applied')
      .map(j => ({ job: j, days: daysSince(j.delivered_at) }))
      .filter(x => x.days !== null && x.days >= 7)
      .sort((a, b) => b.days - a.days)
      .slice(0, 3)
  }, [jobs])

  const displayFollowUps = priorityFollowUps

  // Spline Chart Coordinates calculations
  const spline = useMemo(() => buildSplinePath(jobs), [jobs])

  // Sidebar controls
  const selectedIndex = selectedJob ? rankedJobs.findIndex((job) => getJobId(job) === getJobId(selectedJob)) : -1
  const hasPrev = selectedIndex > 0
  const hasNext = selectedIndex !== -1 && selectedIndex < rankedJobs.length - 1
  const todayStr = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })

  // 2. RENDER PIPELINE
  return (
    <section className="tj-dashboard">
      <DashboardHeader todayStr={todayStr} onLogApplication={() => navigate('/applied')} />

      <div className="tj-focus-grid-top">
        <ActionCards navigate={navigate} />
        <PipelineStats
          appliedCount={appliedCount}
          screeningCount={screeningCount}
          interviewingCount={interviewingCount}
          offersCount={offersCount}
        />
      </div>

      <div className="tj-focus-grid-mid">
        <PriorityFollowUps
          displayFollowUps={displayFollowUps}
          onViewAll={() => navigate('/applied')}
          onFollowUp={(job) => { setSelectedJob(job); setSidebarOpen(true) }}
        />
        <ActivityChart spline={spline} />
      </div>

      <JobRecommendations topMatches={topMatches} setSelectedJob={setSelectedJob} />

      <JobSidebar
        job={selectedJob}
        open={!!selectedJob}
        onClose={() => setSelectedJob(null)}
        onStatusChange={(id, v) => onStatusChange(id, v)}
        onDelete={(id) => { onDelete(id); setSelectedJob(null); }}
        hasPrev={hasPrev}
        hasNext={hasNext}
        onPrev={() => setSelectedJob(rankedJobs[selectedIndex - 1])}
        onNext={() => setSelectedJob(rankedJobs[selectedIndex + 1])}
      />
    </section>
  )
}

export default TodaysJobs
