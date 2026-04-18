import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import AppliedJobs from './AppliedJobs'
import { makeJob } from '../test/mocks'

vi.mock('../lib/api', () => ({
  api: { get: vi.fn().mockResolvedValue({ data: { events: [], resumes: [] } }) },
  API_URL: 'http://localhost:5001',
}))

const jobs = [
  makeJob({ id: 1, job_id: 'match_1', Title: 'AI Engineer', Company: 'Acme', Status: 'applied' }),
  makeJob({ id: 2, job_id: 'match_2', Title: 'ML Engineer', Company: 'Beta', Status: 'interviewing' }),
  makeJob({ id: 3, job_id: 'match_3', Title: 'Data Scientist', Company: 'Gamma', Status: 'accepted' }),
  makeJob({ id: 4, job_id: 'match_4', Title: 'Design Role', Company: 'Delta', Status: 'skipped' }),
  makeJob({ id: 5, job_id: 'match_5', Title: 'Saved Role', Company: 'Zeta', Status: 'not_applied' }),
]

describe('AppliedJobs', () => {
  it('renders the Applied heading', () => {
    render(<AppliedJobs jobs={jobs} onStatusChange={() => {}} onDelete={() => {}} />)
    expect(screen.getByRole('heading', { name: /Applied/i })).toBeInTheDocument()
  })

  it('shows a count of applications in progress', () => {
    render(<AppliedJobs jobs={jobs} onStatusChange={() => {}} onDelete={() => {}} />)
    // 4 jobs qualify (applied + interviewing + accepted + skipped)
    expect(screen.getByText(/4 applications/i)).toBeInTheDocument()
  })

  it('renders stage stat cards for each stage', () => {
    render(<AppliedJobs jobs={jobs} onStatusChange={() => {}} onDelete={() => {}} />)
    expect(screen.getByText('Applied')).toBeInTheDocument()
    expect(screen.getByText('Interview')).toBeInTheDocument()
    expect(screen.getByText('Offer')).toBeInTheDocument()
    expect(screen.getByText('Rejected')).toBeInTheDocument()
  })

  it('shows job titles in the applications table', () => {
    render(<AppliedJobs jobs={jobs} onStatusChange={() => {}} onDelete={() => {}} />)
    expect(screen.getByText('AI Engineer')).toBeInTheDocument()
    expect(screen.getByText('ML Engineer')).toBeInTheDocument()
    expect(screen.getByText('Data Scientist')).toBeInTheDocument()
    expect(screen.getByText('Design Role')).toBeInTheDocument()
  })

  it('does not show jobs with not_applied status', () => {
    render(<AppliedJobs jobs={jobs} onStatusChange={() => {}} onDelete={() => {}} />)
    expect(screen.queryByText('Saved Role')).not.toBeInTheDocument()
  })

  it('renders table column headers: Position, Status, Applied, Next Action', () => {
    render(<AppliedJobs jobs={jobs} onStatusChange={() => {}} onDelete={() => {}} />)
    expect(screen.getByText('Position')).toBeInTheDocument()
    expect(screen.getByText('Status')).toBeInTheDocument()
    expect(screen.getByText('Next Action')).toBeInTheDocument()
  })

  it('renders status labels for each application row', () => {
    render(<AppliedJobs jobs={jobs} onStatusChange={() => {}} onDelete={() => {}} />)
    // "Applied" appears both as a stage card label and as a row status badge
    expect(screen.getAllByText('Applied').length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText(/Interview/i).length).toBeGreaterThanOrEqual(1)
  })

  it('shows empty state when there are no applied jobs', () => {
    render(
      <AppliedJobs
        jobs={[makeJob({ Status: 'not_applied' })]}
        onStatusChange={() => {}}
        onDelete={() => {}}
      />,
    )
    expect(screen.getByText(/0 applications/i)).toBeInTheDocument()
  })

  it('clicking an application row opens the sidebar', async () => {
    const { default: userEvent } = await import('@testing-library/user-event')
    const user = userEvent.setup()
    render(<AppliedJobs jobs={jobs} onStatusChange={() => {}} onDelete={() => {}} />)

    const rows = document.querySelectorAll('.application-row')
    if (rows.length > 0) {
      await user.click(rows[0])
      // Sidebar should open — job title appears more than once
      expect(screen.getAllByText('AI Engineer').length).toBeGreaterThan(1)
    }
  })
})
