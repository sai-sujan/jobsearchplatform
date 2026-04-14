import { useMemo, useState } from 'react'
import { api } from '../lib/api'
import './OnboardingPage.css'

const STEPS = [
  'welcome',
  'resume',
  'roles',
  'preferences',
  'presets',
  'automation',
]

const DEFAULT_PROFILE = {
  full_name: '',
  target_roles: [],
  seniority: '',
  preferred_locations: [],
  work_modes: [],
  employment_types: [],
  industries: [],
  visa_preferences: {},
  salary_expectations: '',
  candidate_summary: '',
  parsed_skills: [],
  onboarding_step: 'welcome',
  automation_connected: false,
}

function splitCsv(value) {
  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
}

function OnboardingPage({ session, onboarding, onCompleted, onUpdated }) {
  const [stepIndex, setStepIndex] = useState(() => Math.max(STEPS.indexOf(onboarding?.profile?.onboarding_step || 'welcome'), 0))
  const [resumeText, setResumeText] = useState(onboarding?.resume?.original_text || '')
  const [profile, setProfile] = useState({
    ...DEFAULT_PROFILE,
    full_name: onboarding?.user?.full_name || '',
    ...(onboarding?.profile || {}),
  })
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  const step = STEPS[stepIndex]
  const presets = onboarding?.search_presets || []
  const canContinue =
    step === 'welcome' ||
    (step === 'resume' && resumeText.trim().length >= 50) ||
    (step === 'roles' && profile.target_roles.length > 0) ||
    ['preferences', 'presets', 'automation'].includes(step)

  const nextLabel = stepIndex === STEPS.length - 1 ? 'Finish onboarding' : 'Continue'
  const stepTitle = useMemo(() => {
    switch (step) {
      case 'welcome':
        return 'Let’s set up your personalized job workspace.'
      case 'resume':
        return 'Paste your current resume so we can tailor recommendations.'
      case 'roles':
        return 'Tell us what kind of roles actually fit you.'
      case 'preferences':
        return 'Add location, work style, and career constraints.'
      case 'presets':
        return 'Review the search presets generated from your profile.'
      case 'automation':
        return 'Choose how much automation you want right now.'
      default:
        return 'Set up your workspace'
    }
  }, [step])

  const saveResume = async () => {
    const response = await api.post('/api/onboarding/resume', {
      resume_text: resumeText,
      filename: 'resume.txt',
      content_type: 'text/plain',
    })
    onUpdated(response.data)
    setProfile((current) => ({
      ...current,
      parsed_skills: response.data.profile.parsed_skills || [],
    }))
  }

  const saveProfile = async (nextStep) => {
    const response = await api.put('/api/onboarding/profile', {
      ...profile,
      onboarding_step: nextStep,
    })
    onUpdated(response.data)
  }

  const handleNext = async () => {
    setSubmitting(true)
    setError('')
    try {
      if (step === 'resume') {
        await saveResume()
      } else if (step === 'roles' || step === 'preferences') {
        await saveProfile(step === 'roles' ? 'preferences' : 'presets')
      } else if (step === 'presets') {
        await saveProfile('automation')
      } else if (step === 'automation') {
        const response = await api.post('/api/onboarding/complete', {
          onboarding_step: 'complete',
          automation_connected: profile.automation_connected,
        })
        onCompleted(response.data)
        return
      }

      setStepIndex((current) => Math.min(current + 1, STEPS.length - 1))
    } catch (requestError) {
      setError(requestError.response?.data?.detail || 'Unable to save this step right now.')
    } finally {
      setSubmitting(false)
    }
  }

  const handleBack = () => {
    setError('')
    setStepIndex((current) => Math.max(current - 1, 0))
  }

  return (
    <section className="onboarding-shell">
      <div className="onboarding-layout">
        <aside className="onboarding-steps">
          <span className="eyebrow">New account</span>
          <h1>{stepTitle}</h1>
          <p>
            {session?.username ? `Welcome, ${session.username}.` : 'Welcome.'} We&apos;ll use this setup to
            decide what jobs to show you, how to describe them, and how to tailor resumes later.
          </p>

          <ol>
            {STEPS.map((item, index) => (
              <li key={item} className={index === stepIndex ? 'active' : index < stepIndex ? 'done' : ''}>
                <span>{index + 1}</span>
                <strong>{item === 'presets' ? 'Search setup' : item[0].toUpperCase() + item.slice(1)}</strong>
              </li>
            ))}
          </ol>
        </aside>

        <div className="onboarding-card">
          {step === 'welcome' && (
            <div className="onboarding-panel">
              <h2>What happens next</h2>
              <ul>
                <li>You add your resume and target roles once.</li>
                <li>We generate role-aware search presets for your account.</li>
                <li>You land in a web app that only shows matched jobs, not the full scraped pool.</li>
              </ul>
            </div>
          )}

          {step === 'resume' && (
            <div className="onboarding-panel">
              <label>
                <span>Paste your resume text</span>
                <textarea
                  value={resumeText}
                  onChange={(event) => setResumeText(event.target.value)}
                  placeholder="Paste your current resume here..."
                />
              </label>
            </div>
          )}

          {step === 'roles' && (
            <div className="onboarding-grid">
              <label>
                <span>Full name</span>
                <input
                  value={profile.full_name}
                  onChange={(event) => setProfile((current) => ({ ...current, full_name: event.target.value }))}
                />
              </label>
              <label>
                <span>Target roles</span>
                <input
                  value={profile.target_roles.join(', ')}
                  onChange={(event) =>
                    setProfile((current) => ({ ...current, target_roles: splitCsv(event.target.value) }))
                  }
                  placeholder="Frontend Engineer, Product Designer, Data Analyst"
                />
              </label>
              <label>
                <span>Seniority</span>
                <input
                  value={profile.seniority}
                  onChange={(event) => setProfile((current) => ({ ...current, seniority: event.target.value }))}
                  placeholder="Entry level, Mid level, Senior"
                />
              </label>
              <label>
                <span>Parsed skills</span>
                <input
                  value={(profile.parsed_skills || []).join(', ')}
                  onChange={(event) =>
                    setProfile((current) => ({ ...current, parsed_skills: splitCsv(event.target.value) }))
                  }
                  placeholder="Skills found from your resume"
                />
              </label>
            </div>
          )}

          {step === 'preferences' && (
            <div className="onboarding-grid">
              <label>
                <span>Preferred locations</span>
                <input
                  value={profile.preferred_locations.join(', ')}
                  onChange={(event) =>
                    setProfile((current) => ({ ...current, preferred_locations: splitCsv(event.target.value) }))
                  }
                  placeholder="Chicago, Remote, New York"
                />
              </label>
              <label>
                <span>Work modes</span>
                <input
                  value={profile.work_modes.join(', ')}
                  onChange={(event) =>
                    setProfile((current) => ({ ...current, work_modes: splitCsv(event.target.value) }))
                  }
                  placeholder="Remote, Hybrid, On-site"
                />
              </label>
              <label>
                <span>Employment types</span>
                <input
                  value={profile.employment_types.join(', ')}
                  onChange={(event) =>
                    setProfile((current) => ({ ...current, employment_types: splitCsv(event.target.value) }))
                  }
                  placeholder="Full-time, Internship, Contract"
                />
              </label>
              <label>
                <span>Industries</span>
                <input
                  value={profile.industries.join(', ')}
                  onChange={(event) =>
                    setProfile((current) => ({ ...current, industries: splitCsv(event.target.value) }))
                  }
                  placeholder="Fintech, Healthcare, Consumer"
                />
              </label>
              <label className="onboarding-grid-wide">
                <span>Candidate summary</span>
                <textarea
                  value={profile.candidate_summary || ''}
                  onChange={(event) =>
                    setProfile((current) => ({ ...current, candidate_summary: event.target.value }))
                  }
                  placeholder="A short summary that should shape recommendations and tailoring."
                />
              </label>
            </div>
          )}

          {step === 'presets' && (
            <div className="onboarding-panel">
              <h2>Generated search presets</h2>
              <div className="preset-list">
                {presets.length > 0 ? (
                  presets.map((preset) => (
                    <article key={preset.id || preset.label} className="preset-card">
                      <strong>{preset.label}</strong>
                      <p>{(preset.keywords || []).join(' • ')}</p>
                    </article>
                  ))
                ) : (
                  <p className="empty-copy">Your presets will appear here after saving your profile.</p>
                )}
              </div>
            </div>
          )}

          {step === 'automation' && (
            <div className="onboarding-panel">
              <h2>Automation is optional</h2>
              <p>
                This user web app only shows matched jobs. Scraping and ingestion can be connected later
                by another service, so you can start with a clean recommendations workspace today.
              </p>
              <label className="checkbox-choice">
                <input
                  type="checkbox"
                  checked={Boolean(profile.automation_connected)}
                  onChange={(event) =>
                    setProfile((current) => ({ ...current, automation_connected: event.target.checked }))
                  }
                />
                <span>I already have automation connected for this account.</span>
              </label>
            </div>
          )}

          {error && <div className="auth-error">{error}</div>}

          <div className="onboarding-actions">
            <button type="button" className="secondary-action" onClick={handleBack} disabled={stepIndex === 0 || submitting}>
              Back
            </button>
            <button type="button" className="primary-action" onClick={handleNext} disabled={!canContinue || submitting}>
              {submitting ? 'Saving...' : nextLabel}
            </button>
          </div>
        </div>
      </div>
    </section>
  )
}

export default OnboardingPage
