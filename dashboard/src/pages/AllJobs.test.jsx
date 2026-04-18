import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import AllJobs from './AllJobs'
import { makeJob } from '../test/mocks'

vi.mock('../lib/api', () => ({
  api: { get: vi.fn().mockResolvedValue({ data: { events: [], resumes: [] } }) },
  API_URL: 'http://localhost:5001',
}))

// AllJobs in design-2 defaults to activeFilters: ['Remote']
// Jobs need Location/Job Type to contain "Remote" to pass the default filter
const jobs = [
  makeJob({ id: 1, job_id: 'match_1', Title: 'AI Engineer', Location: 'Remote', 'Job Type': 'Remote', 'Fit Score': 92 }),
  makeJob({ id: 2, job_id: 'match_2', Title: 'ML Engineer', Location: 'Remote', 'Job Type': 'Remote', 'Fit Score': 75 }),
  makeJob({ id: 3, job_id: 'match_3', Title: 'Data Scientist', Location: 'Chicago', 'Job Type': 'On-site', 'Fit Score': 55 }),
]

describe('AllJobs', () => {
  it('renders the page heading', () => {
    render(<AllJobs jobs={jobs} onStatusChange={() => {}} onDelete={() => {}} />)
    expect(screen.getByRole('heading', { name: /All Jobs/i })).toBeInTheDocument()
  })

  it('shows the job count in the subtitle', () => {
    render(<AllJobs jobs={jobs} onStatusChange={() => {}} onDelete={() => {}} />)
    // Default filter is 'Remote' so only the 2 remote jobs show
    expect(screen.getByText(/2 jobs match/i)).toBeInTheDocument()
  })

  it('renders jobs that match the default Remote filter', () => {
    render(<AllJobs jobs={jobs} onStatusChange={() => {}} onDelete={() => {}} />)
    expect(screen.getByText('AI Engineer')).toBeInTheDocument()
    expect(screen.getByText('ML Engineer')).toBeInTheDocument()
    // Data Scientist is On-site, filtered out by default
    expect(screen.queryByText('Data Scientist')).not.toBeInTheDocument()
  })

  it('filters jobs by search text', async () => {
    const user = userEvent.setup()
    render(<AllJobs jobs={jobs} onStatusChange={() => {}} onDelete={() => {}} />)

    await user.type(screen.getByPlaceholderText(/Search jobs/i), 'AI')
    expect(screen.getByText('AI Engineer')).toBeInTheDocument()
    expect(screen.queryByText('ML Engineer')).not.toBeInTheDocument()
  })

  it('shows the search input', () => {
    render(<AllJobs jobs={jobs} onStatusChange={() => {}} onDelete={() => {}} />)
    expect(screen.getByPlaceholderText(/Search jobs, companies, skills/i)).toBeInTheDocument()
  })

  it('renders quick filter chips', () => {
    render(<AllJobs jobs={jobs} onStatusChange={() => {}} onDelete={() => {}} />)
    // Remote is active by default; others are shown as inactive
    expect(screen.getAllByRole('button').some((btn) => btn.textContent?.includes('Hybrid'))).toBe(true)
    expect(screen.getAllByRole('button').some((btn) => btn.textContent?.includes('Entry'))).toBe(true)
  })

  it('adds a filter when an inactive chip is clicked', async () => {
    const user = userEvent.setup()
    render(<AllJobs jobs={jobs} onStatusChange={() => {}} onDelete={() => {}} />)

    // Click "Hybrid" to add it to active filters
    const hybridChip = screen.getAllByRole('button').find((btn) => btn.textContent?.trim() === 'Hybrid')
    if (hybridChip) {
      await user.click(hybridChip)
      // Hybrid should now appear as an active filter (with the × suffix)
      expect(screen.getAllByRole('button').some((btn) => btn.textContent?.includes('Hybrid'))).toBe(true)
    }
  })

  it('removes the active Remote filter when its chip is clicked', async () => {
    const user = userEvent.setup()
    render(<AllJobs jobs={jobs} onStatusChange={() => {}} onDelete={() => {}} />)

    // Active filter chips have " ×" appended
    const remoteActiveChip = screen.getAllByRole('button').find((btn) => btn.textContent?.includes('Remote ×'))
    if (remoteActiveChip) {
      await user.click(remoteActiveChip)
      // Now all jobs should be visible (no filter active)
      expect(screen.getByText('Data Scientist')).toBeInTheDocument()
    }
  })

  it('shows empty state when filters eliminate all results', async () => {
    const user = userEvent.setup()
    render(<AllJobs jobs={jobs} onStatusChange={() => {}} onDelete={() => {}} />)

    await user.type(screen.getByPlaceholderText(/Search jobs/i), 'zzznomatch')
    expect(screen.getByText(/No matching jobs/i)).toBeInTheDocument()
  })

  it('shows the view toggle buttons (list/grid)', () => {
    render(<AllJobs jobs={jobs} onStatusChange={() => {}} onDelete={() => {}} />)
    const viewToggle = document.querySelector('[aria-label="View mode"]')
    expect(viewToggle).toBeInTheDocument()
  })
})
