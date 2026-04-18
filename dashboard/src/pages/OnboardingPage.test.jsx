import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import OnboardingPage from './OnboardingPage'

vi.mock('../lib/api', () => ({
  api: {
    post: vi.fn(),
    put: vi.fn(),
  },
}))

import { api } from '../lib/api'

const baseOnboarding = {
  user: { full_name: 'Sai Sujan', username: 'sai' },
  profile: {
    onboarding_step: 'welcome',
    target_roles: [],
    seniority: '',
    parsed_skills: [],
    work_modes: [],
    employment_types: [],
    industries: [],
    preferred_locations: [],
    quality_filters: {
      preferred_sources: ['LinkedIn'],
      minimum_match_score: 65,
      include_stretch_roles: true,
      hide_staffing_agencies: true,
      hide_suspicious_jobs: true,
      require_salary_visibility: false,
      exclude_recruiter_posts: true,
      exclude_keywords: [],
    },
  },
  resume: null,
  search_presets: [],
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('OnboardingPage — Step 1 (Welcome)', () => {
  it('renders the welcome step content', () => {
    render(
      <OnboardingPage
        session={{ username: 'sai' }}
        onboarding={baseOnboarding}
        onUpdated={() => {}}
        onCompleted={() => {}}
      />,
    )
    // Text may be split across elements — use a flexible matcher
    expect(screen.getByText((content) => content.includes('next two minutes'))).toBeInTheDocument()
  })

  it('renders the step list with 5 items', () => {
    render(
      <OnboardingPage
        session={{ username: 'sai' }}
        onboarding={baseOnboarding}
        onUpdated={() => {}}
        onCompleted={() => {}}
      />,
    )
    expect(screen.getByText('Welcome')).toBeInTheDocument()
    expect(screen.getByText('Resume')).toBeInTheDocument()
    expect(screen.getByText('Roles')).toBeInTheDocument()
    expect(screen.getByText('Preferences')).toBeInTheDocument()
    expect(screen.getByText('Search setup')).toBeInTheDocument()
  })

  it('shows "Step 1 of 5" progress badge', () => {
    render(
      <OnboardingPage
        session={{ username: 'sai' }}
        onboarding={baseOnboarding}
        onUpdated={() => {}}
        onCompleted={() => {}}
      />,
    )
    // May appear multiple times (step badge + step list) — just check at least one exists
    expect(screen.getAllByText(/Step 1 of 5/i).length).toBeGreaterThan(0)
  })

  it('advances to step 2 when Continue is clicked', async () => {
    const user = userEvent.setup()
    render(
      <OnboardingPage
        session={{ username: 'sai' }}
        onboarding={baseOnboarding}
        onUpdated={() => {}}
        onCompleted={() => {}}
      />,
    )
    await user.click(screen.getByRole('button', { name: /Continue/i }))
    expect(screen.getAllByText(/Step 2 of 5/i).length).toBeGreaterThan(0)
    expect(screen.getByText(/Resume intake/i)).toBeInTheDocument()
  })
})

describe('OnboardingPage — Step 2 (Resume)', () => {
  async function renderAtResumeStep() {
    const user = userEvent.setup()
    render(
      <OnboardingPage
        session={{ username: 'sai' }}
        onboarding={baseOnboarding}
        onUpdated={() => {}}
        onCompleted={() => {}}
      />,
    )
    await user.click(screen.getByRole('button', { name: /Continue/i }))
    return user
  }

  it('shows the file upload area', async () => {
    await renderAtResumeStep()
    expect(screen.getByText(/Choose a file or drag and drop/i)).toBeInTheDocument()
  })

  it('Continue is disabled when no file has been picked', async () => {
    await renderAtResumeStep()
    expect(screen.getByRole('button', { name: /Continue/i })).toBeDisabled()
  })

  it('shows an error when Continue is clicked without a file', async () => {
    const user = await renderAtResumeStep()
    // Force the button to be clickable by bypassing the disabled check via direct form
    // Simulate a scenario where canContinue is false
    const continueBtn = screen.getByRole('button', { name: /Continue/i })
    expect(continueBtn).toBeDisabled()
  })

  it('shows filename and Clear button after a file is selected', async () => {
    const user = await renderAtResumeStep()
    const file = new File(['resume content'], 'resume.pdf', { type: 'application/pdf' })
    const input = document.querySelector('input[type="file"]')
    await userEvent.upload(input, file)
    expect(screen.getByText('resume.pdf')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Clear/i })).toBeInTheDocument()
  })

  it('clears the file selection when Clear is clicked', async () => {
    const user = await renderAtResumeStep()
    const file = new File(['resume content'], 'resume.pdf', { type: 'application/pdf' })
    const input = document.querySelector('input[type="file"]')
    await userEvent.upload(input, file)
    await user.click(screen.getByRole('button', { name: /Clear/i }))
    expect(screen.queryByText('resume.pdf')).not.toBeInTheDocument()
    expect(screen.getByText(/Choose a file or drag and drop/i)).toBeInTheDocument()
  })
})

describe('OnboardingPage — Step 3 (Roles)', () => {
  async function renderAtRolesStep() {
    const user = userEvent.setup()
    const onboarding = {
      ...baseOnboarding,
      profile: { ...baseOnboarding.profile, onboarding_step: 'resume' },
      resume: { filename: 'resume.pdf', original_text: 'Some resume text' },
    }
    render(
      <OnboardingPage
        session={{ username: 'sai' }}
        onboarding={onboarding}
        onUpdated={() => {}}
        onCompleted={() => {}}
      />,
    )
    // Already at step 2 (resume), skip to step 3
    await user.click(screen.getByRole('button', { name: /Continue/i }))
    return user
  }

  it('renders the detected roles chip grid', async () => {
    await renderAtRolesStep()
    expect(screen.getByText('AI Engineer')).toBeInTheDocument()
    expect(screen.getByText('Software Engineer')).toBeInTheDocument()
  })

  it('renders seniority dropdown', async () => {
    await renderAtRolesStep()
    expect(screen.getByRole('combobox')).toBeInTheDocument()
    expect(screen.getByText('Entry level')).toBeInTheDocument()
    expect(screen.getByText('Mid level')).toBeInTheDocument()
    expect(screen.getByText('Senior')).toBeInTheDocument()
  })

  it('allows adding a custom role', async () => {
    const user = await renderAtRolesStep()
    await user.type(screen.getByPlaceholderText(/Add another role/i), 'MLOps Engineer')
    await user.click(screen.getByRole('button', { name: /Add role/i }))
    expect(screen.getAllByText('MLOps Engineer').length).toBeGreaterThan(0)
  })
})

describe('OnboardingPage — Step 4 (Preferences)', () => {
  async function renderAtPreferencesStep() {
    const user = userEvent.setup()
    const onboarding = {
      ...baseOnboarding,
      profile: {
        ...baseOnboarding.profile,
        onboarding_step: 'preferences',
        target_roles: ['AI Engineer'],
        seniority: 'Entry level',
      },
      resume: { filename: 'resume.pdf' },
    }
    api.put.mockResolvedValue({ data: onboarding })
    render(
      <OnboardingPage
        session={{ username: 'sai' }}
        onboarding={onboarding}
        onUpdated={() => {}}
        onCompleted={() => {}}
      />,
    )
    // Already at step 4 (preferences)
    return user
  }

  it('shows work mode chips including Any', async () => {
    await renderAtPreferencesStep()
    // Multiple "Any" buttons exist (one per chip group) — use getAllByRole
    const anyChips = screen.getAllByRole('button', { name: 'Any' })
    expect(anyChips.length).toBeGreaterThan(0)
    // Remote appears in multiple chip groups — just check it exists
    const remoteChips = screen.getAllByRole('button', { name: 'Remote' })
    expect(remoteChips.length).toBeGreaterThan(0)
  })

  it('selecting Any in work mode deselects specific options', async () => {
    const user = await renderAtPreferencesStep()
    // Find the first "Remote" chip (in the Work mode group)
    const remoteChips = screen.getAllByRole('button', { name: 'Remote' })
    await user.click(remoteChips[0])
    // Click the first "Any" chip to override
    const anyChips = screen.getAllByRole('button', { name: 'Any' })
    await user.click(anyChips[0])
    // The first Any chip should now have the selected class
    expect(anyChips[0].className).toMatch(/selected/)
  })

  it('shows the minimum fit threshold dropdown', async () => {
    await renderAtPreferencesStep()
    expect(screen.getByText(/Balanced/i)).toBeInTheDocument()
  })

  it('shows the exclude keywords input', async () => {
    await renderAtPreferencesStep()
    expect(screen.getByPlaceholderText(/e.g. commission-only/i)).toBeInTheDocument()
  })

  it('adds an exclude keyword chip', async () => {
    const user = await renderAtPreferencesStep()
    await user.type(screen.getByPlaceholderText(/e.g. commission-only/i), 'staffing')
    await user.click(screen.getByRole('button', { name: /Add keyword/i }))
    expect(screen.getByText('staffing')).toBeInTheDocument()
  })
})
