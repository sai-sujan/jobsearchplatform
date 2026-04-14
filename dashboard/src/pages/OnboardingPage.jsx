import { useMemo, useState } from 'react'

import { api } from '../lib/api'
import './OnboardingPage.css'

const STEPS = ['welcome', 'resume', 'roles', 'preferences', 'presets']

const SENIORITY_OPTIONS = ['Entry level', 'Mid level', 'Senior']
const WORK_MODE_OPTIONS = ['Any', 'Remote', 'Hybrid', 'On-site']
const EMPLOYMENT_OPTIONS = ['Any', 'Full-time', 'Internship', 'Contract']
const INDUSTRY_OPTIONS = ['Any', 'Developer Tools', 'SaaS', 'Healthcare', 'Fintech', 'E-commerce', 'Education']
const LOCATION_OPTIONS = ['Any', 'Remote', 'United States', 'Chicago', 'New York', 'San Francisco', 'Austin']
const SOURCE_OPTIONS = ['LinkedIn', 'Indeed', 'Glassdoor', 'Company Site']
const ROLE_LIBRARY = [
  'Software Engineer',
  'Frontend Engineer',
  'Backend Engineer',
  'Full Stack Engineer',
  'Product Engineer',
  'Data Analyst',
  'Data Scientist',
  'Machine Learning Engineer',
  'AI Engineer',
  'Product Manager',
  'Designer',
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
  quality_filters: {
    preferred_sources: ['LinkedIn', 'Indeed', 'Company Site'],
    minimum_match_score: 65,
    include_stretch_roles: true,
    hide_staffing_agencies: true,
    hide_suspicious_jobs: true,
    require_salary_visibility: false,
    exclude_recruiter_posts: true,
    exclude_keywords: [],
  },
  salary_expectations: '',
  candidate_summary: '',
  parsed_skills: [],
  onboarding_step: 'welcome',
  automation_connected: false,
}

function toggleValue(list, value) {
  return list.includes(value) ? list.filter((item) => item !== value) : [...list, value]
}

function toggleWithAny(list, value) {
  // If toggling "Any" on, it becomes the only selection. If toggling off, clear.
  if (value === 'Any') {
    return list.includes('Any') ? [] : ['Any']
  }
  // If toggling any other value on, remove "Any" from the list.
  const withoutAny = list.filter((item) => item !== 'Any')
  return withoutAny.includes(value)
    ? withoutAny.filter((item) => item !== value)
    : [...withoutAny, value]
}

function ChoiceChips({ options, values, onToggle, tone = 'neutral' }) {
  return (
    <div className={`choice-chips choice-chips-${tone}`}>
      {options.map((option) => (
        <button
          key={option}
          type="button"
          className={`choice-chip ${values.includes(option) ? 'selected' : ''}`}
          onClick={() => onToggle(option)}
        >
          {option}
        </button>
      ))}
    </div>
  )
}

function StepBadge({ stepIndex }) {
  return (
    <div className="onboarding-progress-row">
      <span className="onboarding-step-badge">Step {stepIndex + 1} of {STEPS.length}</span>
      <div className="onboarding-progress-track">
        <div
          className="onboarding-progress-fill"
          style={{ width: `${((stepIndex + 1) / STEPS.length) * 100}%` }}
        />
      </div>
    </div>
  )
}

function OnboardingPage({ session, onboarding, onCompleted, onUpdated }) {
  const [stepIndex, setStepIndex] = useState(() => Math.max(STEPS.indexOf(onboarding?.profile?.onboarding_step || 'welcome'), 0))
  const [resumeFile, setResumeFile] = useState(null)
  const [resumeFileName, setResumeFileName] = useState(onboarding?.resume?.filename || '')
  const [profile, setProfile] = useState({
    ...DEFAULT_PROFILE,
    full_name: onboarding?.user?.full_name || '',
    ...(onboarding?.profile || {}),
  })
  const [customRole, setCustomRole] = useState('')
  const [customLocation, setCustomLocation] = useState('')
  const [customExcludeKeyword, setCustomExcludeKeyword] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  const step = STEPS[stepIndex]
  const presets = onboarding?.search_presets || []
  const inferredRoleOptions = useMemo(
    () => Array.from(new Set([...(profile.target_roles || []), ...ROLE_LIBRARY])),
    [profile.target_roles],
  )

  const canContinue =
    step === 'welcome' ||
    (step === 'resume' && (resumeFile !== null || resumeFileName)) ||
    (step === 'roles' && profile.target_roles.length > 0 && profile.seniority) ||
    ['preferences', 'presets'].includes(step)

  const nextLabel = stepIndex === STEPS.length - 1 ? 'Finish setup' : 'Continue'
  const stepTitle = useMemo(() => {
    switch (step) {
      case 'welcome':
        return 'We’ll build your job search workspace around your resume.'
      case 'resume':
        return 'Paste your resume once. We’ll detect your profile automatically.'
      case 'roles':
        return 'Confirm the roles and level we detected for you.'
      case 'preferences':
        return 'Choose the job preferences you actually care about.'
      case 'presets':
        return 'Review the searches we generated from your profile and finish setup.'
      default:
        return 'Set up your workspace'
    }
  }, [step])

  const saveResume = async () => {
    // If a new file was picked, upload it. Otherwise, if a resume is already
    // on file (resumeFileName came from onboarding state), skip re-upload.
    if (!resumeFile) {
      return Boolean(resumeFileName)
    }

    const formData = new FormData()
    formData.append('file', resumeFile)

    const response = await api.post('/api/onboarding/resume', formData)
    onUpdated(response.data)
    setResumeFileName(response.data.resume?.filename || '')
    setResumeFile(null)
    setProfile((current) => ({
      ...current,
      full_name: response.data.user?.full_name || current.full_name,
      ...(response.data.profile || {}),
    }))
    return true
  }

  const saveProfile = async (nextStep) => {
    const response = await api.put('/api/onboarding/profile', {
      ...profile,
      onboarding_step: nextStep,
    })
    onUpdated(response.data)
    setProfile((current) => ({
      ...current,
      ...(response.data.profile || {}),
      full_name: response.data.user?.full_name || current.full_name,
    }))
  }

  const handleNext = async () => {
    setSubmitting(true)
    setError('')
    try {
      if (step === 'resume') {
        const ok = await saveResume()
        if (!ok) {
          setError('Please upload a resume file.')
          return
        }
      } else if (step === 'roles' || step === 'preferences') {
        await saveProfile(step === 'roles' ? 'preferences' : 'presets')
      } else if (step === 'presets') {
        const response = await api.post('/api/onboarding/complete', {
          onboarding_step: 'complete',
          automation_connected: false,
        })
        onCompleted(response.data)
        return
      }

      setStepIndex((current) => Math.min(current + 1, STEPS.length - 1))
    } catch (requestError) {
      const errorMsg = requestError.response?.data?.detail || requestError.message || 'Unable to save this step right now.'
      console.error(`[${step}] Error:`, errorMsg, requestError)
      setError(errorMsg)
    } finally {
      setSubmitting(false)
    }
  }

  const handleBack = () => {
    setError('')
    setStepIndex((current) => Math.max(current - 1, 0))
  }

  const addCustomRole = () => {
    if (!customRole.trim()) return
    setProfile((current) => ({
      ...current,
      target_roles: Array.from(new Set([...current.target_roles, customRole.trim()])),
    }))
    setCustomRole('')
  }

  const addCustomLocation = () => {
    if (!customLocation.trim()) return
    setProfile((current) => ({
      ...current,
      preferred_locations: Array.from(new Set([...current.preferred_locations, customLocation.trim()])),
    }))
    setCustomLocation('')
  }

  const addExcludeKeyword = () => {
    if (!customExcludeKeyword.trim()) return
    setProfile((current) => ({
      ...current,
      quality_filters: {
        ...(current.quality_filters || {}),
        exclude_keywords: Array.from(
          new Set([...(current.quality_filters?.exclude_keywords || []), customExcludeKeyword.trim()]),
        ),
      },
    }))
    setCustomExcludeKeyword('')
  }

  return (
    <section className="onboarding-shell">
      <div className="onboarding-layout">
        <aside className="onboarding-steps">
          <span className="eyebrow">New account</span>
          <h1>{stepTitle}</h1>
          <p>
            {session?.username ? `Welcome, ${session.username}.` : 'Welcome.'} Most of the setup should
            be automatic. You’re mainly confirming what the app detected from your resume.
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
          <StepBadge stepIndex={stepIndex} />

          {step === 'welcome' && (
            <div className="onboarding-panel onboarding-hero-panel">
              <div className="onboarding-intro-copy">
                <h2>Here’s what happens in the next two minutes</h2>
                <p>
                  Paste your resume once, let the app infer your roles and skills, confirm the
                  important parts, and land in a cleaner job workspace built around your fit.
                </p>
              </div>
              <div className="onboarding-callouts">
                <article>
                  <strong>Automatic profile setup</strong>
                  <p>We detect likely roles, seniority, and skills from your resume before you type anything.</p>
                </article>
                <article>
                  <strong>No scraper noise</strong>
                  <p>You only see matched jobs, not the full raw dataset or internal ingestion controls.</p>
                </article>
                <article>
                  <strong>Easy to adjust later</strong>
                  <p>You can edit your profile, resume, and search setup any time from the Profile page.</p>
                </article>
              </div>
            </div>
          )}

          {step === "resume" && (
            <div className="onboarding-panel">
              <div className="onboarding-section-head">
                <div>
                  <h2>Resume intake</h2>
                  <p>Upload your current resume and we will prefill the rest of onboarding from it.</p>
                </div>
                <span className="onboarding-helper-pill">Auto-detect roles and skills</span>
              </div>

              <label className="file-upload-label">
                <span>Upload resume</span>
                <div className="file-upload-wrapper">
                  <input
                    type="file"
                    accept=".pdf,.doc,.docx,.txt"
                    onChange={(event) => {
                      setResumeFile(event.target.files?.[0] || null)
                      if (event.target.files?.[0]) {
                        setResumeFileName(event.target.files[0].name)
                      }
                    }}
                  />
                  <div className="file-upload-display">
                    {resumeFileName ? (
                      <div className="file-selected">
                        <span>Check {resumeFileName}</span>
                        <button
                          type="button"
                          className="clear-file"
                          onClick={() => {
                            setResumeFile(null)
                            setResumeFileName("")
                          }}
                        >
                          Clear
                        </button>
                      </div>
                    ) : (
                      <div className="file-placeholder">
                        <span>Choose a file or drag and drop</span>
                        <p>PDF, DOC, DOCX, or TXT (max 10MB)</p>
                      </div>
                    )}
                  </div>
                </div>
              </label>
            </div>
          )}

          {step === 'roles' && (
            <div className="onboarding-grid">
              <div className="onboarding-grid-wide onboarding-card-block">
                <div className="onboarding-section-head">
                  <div>
                    <h2>Detected target roles</h2>
                    <p>Select the roles that best represent what you want to see in your matched feed.</p>
                  </div>
                  <span className="onboarding-helper-pill">Suggested from your resume</span>
                </div>

                <ChoiceChips
                  options={inferredRoleOptions}
                  values={profile.target_roles}
                  onToggle={(role) =>
                    setProfile((current) => ({
                      ...current,
                      target_roles: toggleValue(current.target_roles, role),
                    }))
                  }
                  tone="accent"
                />

                <div className="onboarding-inline-input">
                  <input
                    value={customRole}
                    onChange={(event) => setCustomRole(event.target.value)}
                    placeholder="Add another role"
                  />
                  <button type="button" className="secondary-action onboarding-inline-button" onClick={addCustomRole}>
                    Add role
                  </button>
                </div>
              </div>

              <label>
                <span>Full name</span>
                <input
                  value={profile.full_name}
                  onChange={(event) => setProfile((current) => ({ ...current, full_name: event.target.value }))}
                />
              </label>

              <label>
                <span>Seniority</span>
                <select
                  value={profile.seniority || ''}
                  onChange={(event) => setProfile((current) => ({ ...current, seniority: event.target.value }))}
                >
                  <option value="">Select level</option>
                  {SENIORITY_OPTIONS.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </label>

              <div className="onboarding-grid-wide onboarding-card-block">
                <div className="onboarding-section-head">
                  <div>
                    <h2>Detected skills</h2>
                    <p>These will help decide what gets matched to you and how resume tailoring starts.</p>
                  </div>
                </div>
                <div className="skill-chip-row">
                  {(profile.parsed_skills || []).length > 0 ? (
                    profile.parsed_skills.map((skill) => (
                      <span key={skill} className="skill-chip">
                        {skill}
                      </span>
                    ))
                  ) : (
                    <p className="onboarding-muted">No skills detected yet. Save your resume first.</p>
                  )}
                </div>
              </div>
            </div>
          )}

          {step === 'preferences' && (
            <div className="onboarding-grid">
              <div className="onboarding-card-block onboarding-grid-wide">
                <div className="onboarding-section-head">
                  <div>
                    <h2>Work mode</h2>
                    <p>Choose how you want these roles to feel in practice. Pick "Any" for no filter.</p>
                  </div>
                </div>
                <ChoiceChips
                  options={WORK_MODE_OPTIONS}
                  values={profile.work_modes}
                  onToggle={(value) =>
                    setProfile((current) => ({ ...current, work_modes: toggleWithAny(current.work_modes, value) }))
                  }
                />
              </div>

              <div className="onboarding-card-block onboarding-grid-wide">
                <div className="onboarding-section-head">
                  <div>
                    <h2>Employment type</h2>
                    <p>We prefilled this from your resume where possible, but you can adjust it here.</p>
                  </div>
                </div>
                <ChoiceChips
                  options={EMPLOYMENT_OPTIONS}
                  values={profile.employment_types}
                  onToggle={(value) =>
                    setProfile((current) => ({
                      ...current,
                      employment_types: toggleWithAny(current.employment_types, value),
                    }))
                  }
                />
              </div>

              <div className="onboarding-card-block onboarding-grid-wide">
                <div className="onboarding-section-head">
                  <div>
                    <h2>Industries</h2>
                    <p>Pick the spaces you want the matcher to prioritize.</p>
                  </div>
                </div>
                <ChoiceChips
                  options={INDUSTRY_OPTIONS}
                  values={profile.industries}
                  onToggle={(value) =>
                    setProfile((current) => ({ ...current, industries: toggleWithAny(current.industries, value) }))
                  }
                />
              </div>

              <div className="onboarding-card-block onboarding-grid-wide">
                <div className="onboarding-section-head">
                  <div>
                    <h2>Preferred locations</h2>
                    <p>Add a few places you care about. Select "Any" to see roles everywhere.</p>
                  </div>
                </div>
                <ChoiceChips
                  options={LOCATION_OPTIONS}
                  values={profile.preferred_locations}
                  onToggle={(value) =>
                    setProfile((current) => ({
                      ...current,
                      preferred_locations: toggleWithAny(current.preferred_locations, value),
                    }))
                  }
                />
                <div className="onboarding-inline-input">
                  <input
                    value={customLocation}
                    onChange={(event) => setCustomLocation(event.target.value)}
                    placeholder="Add another location"
                  />
                  <button type="button" className="secondary-action onboarding-inline-button" onClick={addCustomLocation}>
                    Add location
                  </button>
                </div>
              </div>

              <div className="onboarding-card-block onboarding-grid-wide">
                <div className="onboarding-section-head">
                  <div>
                    <h2>Feed quality controls</h2>
                    <p>Use these to reduce fake jobs, recruiter spam, and low-quality matches.</p>
                  </div>
                </div>

                <label>
                  <span>Preferred sources</span>
                </label>
                <ChoiceChips
                  options={SOURCE_OPTIONS}
                  values={profile.quality_filters?.preferred_sources || []}
                  onToggle={(value) =>
                    setProfile((current) => ({
                      ...current,
                      quality_filters: {
                        ...(current.quality_filters || {}),
                        preferred_sources: toggleValue(current.quality_filters?.preferred_sources || [], value),
                      },
                    }))
                  }
                />

                <label>
                  <span>Minimum fit threshold</span>
                  <select
                    value={String(profile.quality_filters?.minimum_match_score ?? 65)}
                    onChange={(event) =>
                      setProfile((current) => ({
                        ...current,
                        quality_filters: {
                          ...(current.quality_filters || {}),
                          minimum_match_score: Number(event.target.value),
                        },
                      }))
                    }
                  >
                    <option value="55">Show broader matches</option>
                    <option value="65">Balanced</option>
                    <option value="75">Only stronger matches</option>
                    <option value="85">Only top-fit roles</option>
                  </select>
                </label>

                <div className="toggle-grid">
                  {[
                    ['include_stretch_roles', 'Include stretch roles if they are still promising'],
                    ['hide_staffing_agencies', 'Hide staffing agency posts'],
                    ['hide_suspicious_jobs', 'Hide suspicious or low-trust listings'],
                    ['exclude_recruiter_posts', 'Hide recruiter-style listings'],
                    ['require_salary_visibility', 'Only show roles with visible salary'],
                  ].map(([key, label]) => (
                    <label key={key} className="toggle-card">
                      <input
                        type="checkbox"
                        checked={Boolean(profile.quality_filters?.[key])}
                        onChange={(event) =>
                          setProfile((current) => ({
                            ...current,
                            quality_filters: {
                              ...(current.quality_filters || {}),
                              [key]: event.target.checked,
                            },
                          }))
                        }
                      />
                      <span>{label}</span>
                    </label>
                  ))}
                </div>

                <label>
                  <span>Exclude keywords</span>
                </label>
                <div className="onboarding-inline-input">
                  <input
                    value={customExcludeKeyword}
                    onChange={(event) => setCustomExcludeKeyword(event.target.value)}
                    placeholder="e.g. commission-only, staffing, relocation required"
                  />
                  <button type="button" className="secondary-action onboarding-inline-button" onClick={addExcludeKeyword}>
                    Add keyword
                  </button>
                </div>
                <div className="skill-chip-row">
                  {(profile.quality_filters?.exclude_keywords || []).map((keyword) => (
                    <span key={keyword} className="skill-chip">
                      {keyword}
                    </span>
                  ))}
                </div>
              </div>

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
              <div className="onboarding-section-head">
                <div>
                  <h2>Your generated search setup</h2>
                  <p>These are derived from your resume and preferences so your recommendations stay focused.</p>
                </div>
              </div>
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

          {error && <div className="auth-error">{error}</div>}

          <div className="onboarding-actions">
            <button
              type="button"
              className="secondary-action onboarding-nav-button"
              onClick={handleBack}
              disabled={stepIndex === 0 || submitting}
            >
              Back
            </button>
            <button
              type="button"
              className="primary-action onboarding-nav-button"
              onClick={handleNext}
              disabled={!canContinue || submitting}
            >
              {submitting ? 'Saving...' : nextLabel}
            </button>
          </div>
        </div>
      </div>
    </section>
  )
}

export default OnboardingPage
