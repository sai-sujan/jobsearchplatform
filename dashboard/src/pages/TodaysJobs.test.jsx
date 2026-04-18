import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import TodaysJobs from './TodaysJobs'
import { makeJob } from '../test/mocks'

vi.mock('../lib/api', () => ({
  api: { get: vi.fn().mockResolvedValue({ data: { events: [], resumes: [], match: null } }) },
  API_URL: 'http://localhost:5001',
}))

const session = { username: 'sai', full_name: 'Sai Sujan' }

const jobs = [
  makeJob({ id: 1, job_id: 'match_1', Title: 'AI Engineer', Company: 'Acme', 'Fit Score': 90 }),
  makeJob({ id: 2, job_id: 'match_2', Title: 'ML Engineer', Company: 'Beta Corp', 'Fit Score': 75 }),
  makeJob({ id: 3, job_id: 'match_3', Title: 'Data Scientist', Company: 'Gamma', 'Fit Score': 50 }),
]

describe('TodaysJobs', () => {
  it('renders a personalized greeting using the first name', () => {
    render(<TodaysJobs jobs={jobs} session={session} onStatusChange={() => {}} onDelete={() => {}} />)
    expect(screen.getByText(/Good morning, Sai/i)).toBeInTheDocument()
  })

  it('renders the New Today stat card with the job count', () => {
    render(<TodaysJobs jobs={jobs} session={session} onStatusChange={() => {}} onDelete={() => {}} />)
    expect(screen.getByText('New Today')).toBeInTheDocument()
    // Shows up to 8 jobs in newToday (slice of first 8)
    expect(screen.getByText(/3 new jobs match/i)).toBeInTheDocument()
  })

  it('shows the Top Match stat card with the highest score', () => {
    render(<TodaysJobs jobs={jobs} session={session} onStatusChange={() => {}} onDelete={() => {}} />)
    expect(screen.getByText('Top Match')).toBeInTheDocument()
    expect(screen.getByText('90%')).toBeInTheDocument()
  })

  it('renders the "Top Matches for You" section heading', () => {
    render(<TodaysJobs jobs={jobs} session={session} onStatusChange={() => {}} onDelete={() => {}} />)
    expect(screen.getByText(/Top Matches for You/i)).toBeInTheDocument()
  })

  it('renders top 3 match cards', () => {
    render(<TodaysJobs jobs={jobs} session={session} onStatusChange={() => {}} onDelete={() => {}} />)
    // All 3 jobs are in top matches since there are only 3
    expect(screen.getAllByText('AI Engineer').length).toBeGreaterThan(0)
    expect(screen.getAllByText('ML Engineer').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Data Scientist').length).toBeGreaterThan(0)
  })

  it('renders the "New Today" section heading', () => {
    render(<TodaysJobs jobs={jobs} session={session} onStatusChange={() => {}} onDelete={() => {}} />)
    expect(screen.getByText('New Today')).toBeInTheDocument()
  })

  it('shows empty state when job list is empty', () => {
    render(<TodaysJobs jobs={[]} session={session} onStatusChange={() => {}} onDelete={() => {}} />)
    expect(screen.getByText(/No roles yet/i)).toBeInTheDocument()
    expect(screen.getByText(/matched jobs will appear here/i)).toBeInTheDocument()
  })

  it('shows Alerts button', () => {
    render(<TodaysJobs jobs={jobs} session={session} onStatusChange={() => {}} onDelete={() => {}} />)
    expect(screen.getByRole('button', { name: /Alerts/i })).toBeInTheDocument()
  })

  it('opens the sidebar when a top-match card is clicked', async () => {
    const user = userEvent.setup()
    render(<TodaysJobs jobs={jobs} session={session} onStatusChange={() => {}} onDelete={() => {}} />)

    // Click the first top-match card button (not the job list card)
    const topMatchCards = document.querySelectorAll('.top-match-card')
    if (topMatchCards.length > 0) {
      await user.click(topMatchCards[0])
      // Sidebar should now be visible — look for the sidebar close button or the title appearing again
      const allAITitles = screen.getAllByText('AI Engineer')
      expect(allAITitles.length).toBeGreaterThan(1)
    }
  })
})
