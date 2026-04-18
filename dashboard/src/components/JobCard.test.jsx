import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import JobCard from './JobCard'
import { makeJob } from '../test/mocks'

describe('JobCard', () => {
  it('renders the job title and company', () => {
    render(<JobCard job={makeJob()} onClick={() => {}} />)
    expect(screen.getByRole('heading', { name: /AI Engineer/i })).toBeInTheDocument()
    expect(screen.getByText('Acme Corp')).toBeInTheDocument()
  })

  it('renders the match score badge', () => {
    render(<JobCard job={makeJob({ 'Fit Score': 87 })} onClick={() => {}} />)
    expect(screen.getByText('87%')).toBeInTheDocument()
  })

  it('renders location in the meta row', () => {
    render(<JobCard job={makeJob({ Location: 'Chicago' })} onClick={() => {}} />)
    expect(screen.getByText('Chicago')).toBeInTheDocument()
  })

  it('does not render a status badge when status is not_applied', () => {
    render(<JobCard job={makeJob({ Status: 'not_applied' })} onClick={() => {}} />)
    expect(screen.queryByText('Applied')).not.toBeInTheDocument()
  })

  it('renders a status badge when status is applied', () => {
    render(<JobCard job={makeJob({ Status: 'applied' })} onClick={() => {}} />)
    expect(screen.getByText('Applied')).toBeInTheDocument()
  })

  it('renders a status badge for interviewing', () => {
    render(<JobCard job={makeJob({ Status: 'interviewing' })} onClick={() => {}} />)
    expect(screen.getByText('Interview')).toBeInTheDocument()
  })

  it('renders matched skills as chips (uses non-ambiguous skill names)', () => {
    const job = makeJob({ 'Matched Skills': 'PyTorch, TensorFlow, FastAPI' })
    render(<JobCard job={job} onClick={() => {}} />)
    expect(screen.getByText('PyTorch')).toBeInTheDocument()
    expect(screen.getByText('TensorFlow')).toBeInTheDocument()
    expect(screen.getByText('FastAPI')).toBeInTheDocument()
  })

  it('renders at most 4 skill chips (excluding job type chip)', () => {
    const job = makeJob({ 'Matched Skills': 'Skill1, Skill2, Skill3, Skill4, Skill5, Skill6' })
    render(<JobCard job={job} onClick={() => {}} />)
    expect(screen.getByText('Skill1')).toBeInTheDocument()
    expect(screen.getByText('Skill4')).toBeInTheDocument()
    expect(screen.queryByText('Skill5')).not.toBeInTheDocument()
    expect(screen.queryByText('Skill6')).not.toBeInTheDocument()
  })

  it('renders the company monogram (first letter)', () => {
    render(<JobCard job={makeJob({ Company: 'Zenith AI' })} onClick={() => {}} />)
    // getAllByText since monogram 'Z' is aria-hidden but still in DOM
    expect(screen.getAllByText('Z').length).toBeGreaterThan(0)
  })

  it('shows "Untitled role" when Title is missing', () => {
    render(<JobCard job={makeJob({ Title: undefined })} onClick={() => {}} />)
    expect(screen.getByText('Untitled role')).toBeInTheDocument()
  })

  it('calls onClick with the job when clicked', async () => {
    const user = userEvent.setup()
    const handleClick = vi.fn()
    const job = makeJob()
    render(<JobCard job={job} onClick={handleClick} />)
    await user.click(screen.getByRole('button'))
    expect(handleClick).toHaveBeenCalledWith(job)
  })

  it('renders source as a chip', () => {
    render(<JobCard job={makeJob({ Source: 'Indeed' })} onClick={() => {}} />)
    expect(screen.getByText('Indeed')).toBeInTheDocument()
  })
})
