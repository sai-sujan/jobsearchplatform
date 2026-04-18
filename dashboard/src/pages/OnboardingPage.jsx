import { useMemo, useState } from 'react'

import { api } from '../lib/api'
import './OnboardingPage.css'

const STEPS = ['welcome', 'resume', 'roles', 'preferences', 'presets']

const SENIORITY_OPTIONS = ['Junior', 'Mid-Level', 'Senior', 'Lead', 'Exec']
const EMPLOYMENT_OPTIONS = ['Full-time', 'Contract', 'Freelance']
const WORK_AUTH_OPTIONS = ['US Citizen / Greencard', 'Require Sponsorship']
const INDUSTRY_OPTIONS = ['SaaS', 'Fintech', 'Healthcare', 'E-commerce', 'Developer Tools', 'Education']
const ROLE_LIBRARY = [
  'Product Manager', 'Software Engineer', 'Frontend Engineer', 'Backend Engineer',
  'Full Stack Engineer', 'Data Analyst', 'Data Scientist', 'ML Engineer',
  'AI Engineer', 'Product Designer', 'UX Researcher',
]
const DEFAULT_SKILL_LIBRARY = [
  'Agile Methodology', 'Data Analysis', 'Roadmapping', 'User Research', 'JIRA', 'Product Strategy',
]

const DEFAULT_PROFILE = {
  full_name: '',
  target_roles: [],
  seniority: '',
  preferred_locations: [],
  work_modes: ['Remote'],
  employment_types: ['Full-time'],
  industries: [],
  visa_preferences: { work_authorization: 'US Citizen / Greencard' },
  quality_filters: {
    preferred_sources: ['LinkedIn', 'Indeed', 'Company Site'],
    minimum_match_score: 65,
    include_stretch_roles: true,
    hide_staffing_agencies: true,
    hide_suspicious_jobs: true,
    require_salary_visibility: false,
    exclude_recruiter_posts: true,
    exclude_keywords: ['Meta', 'Crypto'],
  },
  salary_min: 90000,
  salary_max: 150000,
  salary_expectations: '',
  candidate_summary: '',
  parsed_skills: [],
  onboarding_step: 'welcome',
  automation_connected: false,
  integrations: { linkedin: false, job_board_sync: true },
  tracking_defaults: { auto_status_updates: true },
  saved_searches: [
    { id: 'default', label: 'Product Designer – Remote', role: 'Product Designer', location: 'Remote (US)', salary: '$120k+' },
  ],
}

function toggleValue(list, value) {
  return list.includes(value) ? list.filter((item) => item !== value) : [...list, value]
}

function Chip({ children, active, onClick, onRemove, tone }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`co-chip ${active ? 'co-chip-active' : ''} ${tone ? `co-chip-${tone}` : ''}`}
    >
      <span>{children}</span>
      {onRemove && (
        <span
          className="co-chip-x"
          role="button"
          tabIndex={0}
          onClick={(e) => { e.stopPropagation(); onRemove() }}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.stopPropagation(); onRemove() } }}
          aria-label="Remove"
        >×</span>
      )}
    </button>
  )
}

function CheckIcon() {
  return (
    <svg viewBox="0 0 24 24" className="co-check" aria-hidden="true">
      <circle cx="12" cy="12" r="10" fill="#10b981" />
      <path d="M8 12.5l2.8 2.8L16.5 9.5" stroke="#fff" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function LogoMark() {
  return (
    <span className="co-logo-mark" aria-hidden="true">
      <svg viewBox="0 0 24 24">
        <rect x="3" y="7" width="18" height="13" rx="2.2" />
        <path d="M8 7V5.5A1.5 1.5 0 0 1 9.5 4h5A1.5 1.5 0 0 1 16 5.5V7" />
        <path d="M3 12h18" />
      </svg>
    </span>
  )
}

function BusinessFigure() {
  return (
    <div className="co-figure" aria-hidden="true">
      <span className="co-figure-head" />
      <span className="co-figure-glasses" />
      <span className="co-figure-body" />
      <span className="co-figure-laptop" />
      <span className="co-figure-arm" />
    </div>
  )
}

function OnboardingPage({ session, onboarding, onCompleted, onUpdated }) {
  const [stepIndex, setStepIndex] = useState(() => Math.max(STEPS.indexOf(onboarding?.profile?.onboarding_step || 'welcome'), 0))
  const [resumeFile, setResumeFile] = useState(null)
  const [resumeFileName, setResumeFileName] = useState(onboarding?.resume?.filename || '')
  const [pasteMode, setPasteMode] = useState(false)
  const [pastedResume, setPastedResume] = useState('')
  const [termsAccepted, setTermsAccepted] = useState(false)
  const [profile, setProfile] = useState({
    ...DEFAULT_PROFILE,
    full_name: onboarding?.user?.full_name || '',
    ...(onboarding?.profile || {}),
  })
  const [customRole, setCustomRole] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [dragOver, setDragOver] = useState(false)

  const step = STEPS[stepIndex]
  const presets = onboarding?.search_presets || []
  const inferredSkills = (profile.parsed_skills && profile.parsed_skills.length ? profile.parsed_skills : DEFAULT_SKILL_LIBRARY)

  const canContinue =
    step === 'welcome' ||
    (step === 'resume' && (resumeFile !== null || resumeFileName || pastedResume.trim().length > 50) && termsAccepted) ||
    (step === 'roles' && profile.target_roles.length > 0 && profile.seniority) ||
    ['preferences', 'presets'].includes(step)

  const nextLabel = useMemo(() => {
    if (step === 'welcome') return 'Start Setup'
    if (step === 'presets') return 'Finish & Go to Today Feed'
    return 'Next Step'
  }, [step])

  const saveResume = async () => {
    if (!resumeFile) return Boolean(resumeFileName || pastedResume.trim())
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
        if (!ok) { setError('Please upload a resume file or paste your resume text.'); return }
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
      setStepIndex((c) => Math.min(c + 1, STEPS.length - 1))
    } catch (requestError) {
      setError(requestError.response?.data?.detail || requestError.message || 'Unable to save this step right now.')
    } finally {
      setSubmitting(false)
    }
  }

  const handleBack = () => {
    setError('')
    setStepIndex((c) => Math.max(c - 1, 0))
  }

  const handleSkip = () => {
    setError('')
    setStepIndex((c) => Math.min(c + 1, STEPS.length - 1))
  }

  const addCustomRole = () => {
    const trimmed = customRole.trim()
    if (!trimmed) return
    setProfile((current) => ({
      ...current,
      target_roles: Array.from(new Set([...(current.target_roles || []), trimmed])),
    }))
    setCustomRole('')
  }

  const onFilePicked = (file) => {
    if (!file) return
    setResumeFile(file)
    setResumeFileName(file.name)
  }

  return (
    <section className="co-shell">
      {/* Top-right floating controls */}
      <div className="co-topbar-float">
        <span className="co-step-pill">Step {stepIndex + 1} of 5</span>
        <button className="co-topbar-btn" onClick={handleBack} disabled={stepIndex === 0 || submitting}>Back</button>
        <button className="co-topbar-btn" onClick={handleSkip} disabled={stepIndex === STEPS.length - 1 || submitting}>Skip for now</button>
      </div>

      <div className="co-grid">
        {/* LEFT PANEL */}
        <div className="co-panel co-panel-left">
          {/* Progress segments */}
          <div className="co-progress">
            {STEPS.map((_, i) => (
              <span key={i} className={i <= stepIndex ? 'active' : ''} />
            ))}
          </div>

          {/* Brand */}
          <div className="co-brand">
            <LogoMark />
            <strong>CareerOS</strong>
          </div>

          {step === 'welcome' && <WelcomeStep />}
          {step === 'resume' && (
            <ResumeStep
              resumeFileName={resumeFileName}
              onFilePicked={onFilePicked}
              onClear={() => { setResumeFile(null); setResumeFileName('') }}
              dragOver={dragOver}
              setDragOver={setDragOver}
              pasteMode={pasteMode}
              setPasteMode={setPasteMode}
              pastedResume={pastedResume}
              setPastedResume={setPastedResume}
              termsAccepted={termsAccepted}
              setTermsAccepted={setTermsAccepted}
            />
          )}
          {step === 'roles' && (
            <RolesStep
              profile={profile}
              setProfile={setProfile}
              inferredSkills={inferredSkills}
              roleLibrary={ROLE_LIBRARY}
              customRole={customRole}
              setCustomRole={setCustomRole}
              addCustomRole={addCustomRole}
            />
          )}
          {step === 'preferences' && <PreferencesStep profile={profile} setProfile={setProfile} />}
          {step === 'presets' && <PresetsStep profile={profile} setProfile={setProfile} presets={presets} />}

          {error && <div className="co-error">{error}</div>}

          {/* Footer CTA */}
          <div className="co-footer">
            {step !== 'welcome' && (
              <div className="co-footer-status">
                <StatusLine step={step} profile={profile} resumeFileName={resumeFileName} />
              </div>
            )}
            <button
              className="co-cta"
              disabled={!canContinue || submitting}
              onClick={handleNext}
            >
              {submitting ? 'Saving…' : nextLabel} {!submitting && <span className="co-cta-arrow">→</span>}
            </button>
            {step === 'welcome' && (
              <button className="co-tutorial" type="button">
                <span className="co-tutorial-play">▶</span> View Tutorial Video
              </button>
            )}
          </div>
        </div>

        {/* RIGHT PANEL */}
        <div className="co-panel co-panel-right">
          <RightPreview step={step} profile={profile} resumeFileName={resumeFileName} />
        </div>
      </div>
    </section>
  )
}

/* ---------- Step Components ---------- */

function WelcomeStep() {
  return (
    <>
      <div className="co-welcome-chip">Welcome to the future of your career</div>
      <h1 className="co-h1">
        Your career<br />command center.
      </h1>
      <p className="co-lede">
        CareerOS brings everything you need into one intelligent workspace.
        Let's get you set up to land your next big role.
      </p>

      <div className="co-feature-list">
        <Feature
          icon={<FeatureIcon d="M4 12l5 5 11-11" />}
          title="AI Resume Tailor"
          body="Instantly adapt your resume for any job description to beat ATS filters."
        />
        <Feature
          icon={<FeatureIcon d="M4 6h4v12H4zM10 6h4v12h-4zM16 6h4v12h-4z" fill />}
          title="Kanban Job Tracker"
          body="Visualize your pipeline from applied to offer. Never miss a follow-up."
        />
        <Feature
          icon={<FeatureIcon d="M4 18V10M10 18V4M16 18V8M22 18H2" />}
          title="Smart Analytics"
          body="Track your application success rate and optimize your strategy."
        />
      </div>
    </>
  )
}

function Feature({ icon, title, body }) {
  return (
    <div className="co-feature">
      <span className="co-feature-icon">{icon}</span>
      <div>
        <strong>{title}</strong>
        <p>{body}</p>
      </div>
    </div>
  )
}

function FeatureIcon({ d, fill }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d={d} fill={fill ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function ResumeStep({ resumeFileName, onFilePicked, onClear, dragOver, setDragOver, pasteMode, setPasteMode, pastedResume, setPastedResume, termsAccepted, setTermsAccepted }) {
  return (
    <>
      <h1 className="co-h1">Upload your resume.</h1>
      <p className="co-lede">
        We'll extract your experience and skills to build your profile automatically. Supported formats: PDF, DOCX.
      </p>

      <label
        className={`co-dropzone ${dragOver ? 'drag-over' : ''} ${resumeFileName ? 'has-file' : ''}`}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault(); setDragOver(false)
          onFilePicked(e.dataTransfer.files?.[0])
        }}
      >
        <input
          type="file"
          accept=".pdf,.doc,.docx,.txt"
          onChange={(e) => onFilePicked(e.target.files?.[0])}
          hidden
        />
        <span className="co-dropzone-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24"><path d="M12 16V6m0 0l-4 4m4-4l4 4M5 20h14" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </span>
        {resumeFileName ? (
          <>
            <strong className="co-dropzone-title">{resumeFileName}</strong>
            <span className="co-dropzone-sub">Ready to upload</span>
            <button type="button" className="co-browse" onClick={(e) => { e.preventDefault(); onClear() }}>Choose Different File</button>
          </>
        ) : (
          <>
            <strong className="co-dropzone-title">Click to upload or drag and drop</strong>
            <span className="co-dropzone-sub">PDF or DOCX (max. 10MB)</span>
            <span className="co-browse">Browse Files</span>
          </>
        )}
      </label>

      <div className="co-or"><span>OR</span></div>

      <button
        type="button"
        className={`co-paste-toggle ${pasteMode ? 'open' : ''}`}
        onClick={() => setPasteMode((v) => !v)}
      >
        <span className="co-paste-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24"><path d="M9 4h6l1 2h3v14H5V6h3l1-2z" stroke="currentColor" strokeWidth="1.8" fill="none" /><path d="M9 12h6M9 16h6" stroke="currentColor" strokeWidth="1.8" fill="none" strokeLinecap="round" /></svg>
        </span>
        <span>Paste resume text instead</span>
        <span className="co-paste-caret">{pasteMode ? '▲' : '▾'}</span>
      </button>

      {pasteMode && (
        <textarea
          className="co-paste-area"
          value={pastedResume}
          onChange={(e) => setPastedResume(e.target.value)}
          placeholder="Paste your resume contents here…"
        />
      )}

      <label className="co-terms">
        <input type="checkbox" checked={termsAccepted} onChange={(e) => setTermsAccepted(e.target.checked)} />
        <span>I agree to the <a href="#terms">Terms of Service</a> and consent to CareerOS processing my resume data to create my profile.</span>
      </label>
    </>
  )
}

function RolesStep({ profile, setProfile, inferredSkills, roleLibrary, customRole, setCustomRole, addCustomRole }) {
  const skillPool = Array.from(new Set([...(profile.parsed_skills || []), ...inferredSkills]))
  const selectedRoles = profile.target_roles || []

  return (
    <>
      <h1 className="co-h1">Define your targets.</h1>
      <p className="co-lede">
        Tell us what you're looking for so we can tailor your job feed and resume recommendations.
      </p>

      <div className="co-section">
        <div className="co-section-head">
          <span className="co-section-title">TARGET ROLES</span>
          <span className="co-required">Required (1+)</span>
        </div>
        <div className="co-chip-input">
          {selectedRoles.map((role) => (
            <Chip
              key={role}
              active
              tone="role"
              onRemove={() => setProfile((c) => ({ ...c, target_roles: c.target_roles.filter((r) => r !== role) }))}
            >{role}</Chip>
          ))}
          <input
            value={customRole}
            onChange={(e) => setCustomRole(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addCustomRole() } }}
            placeholder="Type a job title and press Enter…"
          />
        </div>

        <div className="co-seniority">
          {SENIORITY_OPTIONS.map((s) => (
            <button
              key={s}
              type="button"
              className={profile.seniority === s ? 'active' : ''}
              onClick={() => setProfile((c) => ({ ...c, seniority: s }))}
            >{s}</button>
          ))}
        </div>
      </div>

      <div className="co-section">
        <div className="co-section-head">
          <span className="co-section-title">TOP SKILLS</span>
          <span className="co-required">Required (3+)</span>
        </div>
        <div className="co-search-input">
          <svg viewBox="0 0 24 24" aria-hidden="true" className="co-search-icon"><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" /></svg>
          <input placeholder="Search to add skills…" />
        </div>
        <div className="co-extracted">
          <CheckIcon /> Extracted from your resume
        </div>
        <div className="co-chip-row">
          {skillPool.map((skill) => {
            const active = (profile.parsed_skills || []).includes(skill)
            return (
              <Chip
                key={skill}
                active={active}
                tone="skill"
                onClick={() => setProfile((c) => ({
                  ...c,
                  parsed_skills: toggleValue(c.parsed_skills || [], skill),
                }))}
              >{skill} {active ? '✓' : '+'}</Chip>
            )
          })}
        </div>
      </div>

      <div className="co-section">
        <div className="co-section-head">
          <span className="co-section-title">PREFERRED INDUSTRIES</span>
        </div>
        <div className="co-chip-row">
          {INDUSTRY_OPTIONS.map((ind) => {
            const active = (profile.industries || []).includes(ind)
            return (
              <Chip
                key={ind}
                active={active}
                tone="skill"
                onClick={() => setProfile((c) => ({
                  ...c,
                  industries: toggleValue(c.industries || [], ind),
                }))}
              >{ind}</Chip>
            )
          })}
        </div>
      </div>
    </>
  )
}

function PreferencesStep({ profile, setProfile }) {
  const modes = profile.work_modes || []
  const empType = (profile.employment_types || [])[0] || 'Full-time'
  const workAuth = profile.visa_preferences?.work_authorization || 'US Citizen / Greencard'

  const setMode = (mode) => setProfile((c) => ({ ...c, work_modes: [mode] }))
  const setEmp = (val) => setProfile((c) => ({ ...c, employment_types: [val] }))
  const setAuth = (val) => setProfile((c) => ({
    ...c,
    visa_preferences: { ...(c.visa_preferences || {}), work_authorization: val },
  }))

  const [salMin, salMax] = [profile.salary_min || 90000, profile.salary_max || 150000]

  return (
    <>
      <h1 className="co-h1">Fine-tune your search.</h1>
      <p className="co-lede">
        Set your preferences for location, compensation, and work style to ensure we only show relevant opportunities.
      </p>

      <div className="co-section">
        <div className="co-section-head">
          <span className="co-section-title">LOCATION PREFERENCES</span>
          <span className="co-required">Required</span>
        </div>
        <div className="co-toggle-cards co-toggle-cards-4">
          <label className={`co-toggle-card ${modes.includes('Any') ? 'active' : ''}`}>
            <input type="radio" name="mode" checked={modes.includes('Any')} onChange={() => setMode('Any')} />
            <span className="co-toggle-card-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" /><path d="M5 12h14M12 5v14" fill="none" strokeLinecap="round" /></svg>
            </span>
            <span>Any</span>
          </label>
          <label className={`co-toggle-card ${modes.includes('Remote') ? 'active' : ''}`}>
            <input type="radio" name="mode" checked={modes.includes('Remote')} onChange={() => setMode('Remote')} />
            <span className="co-toggle-card-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18" fill="none" /></svg>
            </span>
            <span>Remote</span>
          </label>
          <label className={`co-toggle-card ${modes.includes('Hybrid') ? 'active' : ''}`}>
            <input type="radio" name="mode" checked={modes.includes('Hybrid')} onChange={() => setMode('Hybrid')} />
            <span className="co-toggle-card-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24"><path d="M4 12h7M13 12h7M8 8l-4 4 4 4M16 8l4 4-4 4" fill="none" strokeLinecap="round" strokeLinejoin="round" /></svg>
            </span>
            <span>Hybrid</span>
          </label>
          <label className={`co-toggle-card ${modes.includes('On-site') ? 'active' : ''}`}>
            <input type="radio" name="mode" checked={modes.includes('On-site')} onChange={() => setMode('On-site')} />
            <span className="co-toggle-card-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24"><path d="M4 20V10l8-6 8 6v10" /><path d="M10 20v-6h4v6" fill="none" /></svg>
            </span>
            <span>On-site</span>
          </label>
        </div>
      </div>

      <div className="co-section">
        <div className="co-section-head">
          <span className="co-section-title">EXPECTED SALARY (USD)</span>
        </div>
        <div className="co-salary-row">
          <span className="co-salary-value">${salMin.toLocaleString()}</span>
          <span className="co-salary-step">to</span>
          <span className="co-salary-value">${salMax >= 150000 ? '150,000+' : salMax.toLocaleString()}</span>
        </div>
        <div className="co-salary-slider">
          <input
            type="range" min="40000" max="250000" step="5000" value={salMin}
            onChange={(e) => setProfile((c) => ({ ...c, salary_min: Math.min(Number(e.target.value), (c.salary_max || 150000) - 5000) }))}
          />
          <input
            type="range" min="40000" max="250000" step="5000" value={salMax}
            onChange={(e) => setProfile((c) => ({ ...c, salary_max: Math.max(Number(e.target.value), (c.salary_min || 90000) + 5000) }))}
          />
        </div>
      </div>

      <div className="co-section">
        <div className="co-section-head">
          <span className="co-section-title">EMPLOYMENT DETAILS</span>
        </div>
        <div className="co-sub-label">Employment Type</div>
        <div className="co-seniority">
          {EMPLOYMENT_OPTIONS.map((t) => (
            <button key={t} type="button" className={empType === t ? 'active' : ''} onClick={() => setEmp(t)}>{t}</button>
          ))}
        </div>
        <div className="co-sub-label" style={{ marginTop: '1rem' }}>Work Authorization</div>
        <div className="co-seniority">
          {WORK_AUTH_OPTIONS.map((a) => (
            <button key={a} type="button" className={workAuth === a ? 'active' : ''} onClick={() => setAuth(a)}>{a}</button>
          ))}
        </div>
      </div>
    </>
  )
}

function PresetsStep({ profile, setProfile }) {
  const integrations = profile.integrations || {}
  const tracking = profile.tracking_defaults || {}
  const searches = profile.saved_searches || []

  const setIntegration = (key, val) => setProfile((c) => ({
    ...c, integrations: { ...(c.integrations || {}), [key]: val },
  }))

  return (
    <>
      <h1 className="co-h1">Final Details.</h1>
      <p className="co-lede">
        Set up your saved searches, connect integrations, and configure your tracking defaults.
      </p>

      <div className="co-section">
        <div className="co-section-head">
          <span className="co-section-title">SAVED SEARCH CONFIGURATIONS</span>
          <button className="co-add-new" type="button">+ Add New</button>
        </div>
        {searches.map((s) => (
          <div key={s.id} className="co-saved-search">
            <div>
              <strong>{s.label}</strong>
              <div className="co-saved-meta">
                <span>Role: {s.role}</span>
                <span>Loc: {s.location}</span>
                <span>Sal: {s.salary}</span>
              </div>
            </div>
            <div className="co-saved-actions">
              <button type="button" aria-label="Edit">✎</button>
              <button type="button" aria-label="Delete">🗑</button>
            </div>
          </div>
        ))}
      </div>

      <div className="co-section">
        <div className="co-section-head">
          <span className="co-section-title">INTEGRATIONS &amp; SYNC</span>
        </div>
        <div className="co-integration">
          <span className="co-integration-icon co-int-linkedin">in</span>
          <div>
            <strong>LinkedIn Import</strong>
            <p>Sync profile and work history</p>
          </div>
          <button
            type="button"
            className="co-integration-btn"
            onClick={() => setIntegration('linkedin', !integrations.linkedin)}
          >
            {integrations.linkedin ? 'Connected' : 'Connect'}
          </button>
        </div>
        <div className={`co-integration ${integrations.job_board_sync ? 'connected' : ''}`}>
          <span className="co-integration-icon co-int-board"><LogoMark /></span>
          <div>
            <strong>Job Board Sync</strong>
            <p>Auto-track applications</p>
          </div>
          <span className="co-integration-status">
            <CheckIcon /> {integrations.job_board_sync ? 'Connected' : 'Not connected'}
          </span>
        </div>
      </div>

      <div className="co-section">
        <div className="co-section-head">
          <span className="co-section-title">TRACKING DEFAULTS</span>
        </div>
        <label className="co-track-row">
          <span>Auto-Status Updates</span>
          <input
            type="checkbox"
            className="co-switch"
            checked={Boolean(tracking.auto_status_updates)}
            onChange={(e) => setProfile((c) => ({
              ...c, tracking_defaults: { ...(c.tracking_defaults || {}), auto_status_updates: e.target.checked },
            }))}
          />
        </label>
      </div>
    </>
  )
}

function StatusLine({ step, profile, resumeFileName }) {
  if (step === 'resume') {
    return resumeFileName ? <><CheckIcon /> Resume uploaded</> : <><CheckIcon /> Ready when you are</>
  }
  if (step === 'roles') {
    return (
      <>
        <CheckIcon /> {profile.target_roles?.length || 0} Role{profile.target_roles?.length === 1 ? '' : 's'} added
        <span className="co-sep" />
        <CheckIcon /> {profile.parsed_skills?.length || 0} Skills selected
      </>
    )
  }
  if (step === 'preferences') {
    return (
      <>
        <CheckIcon /> Preferences set
        <span className="co-sep" />
        <CheckIcon /> Alerts active
      </>
    )
  }
  if (step === 'presets') {
    return <><CheckIcon /> Setup Complete</>
  }
  return null
}

function RightPreview({ step, profile, resumeFileName }) {
  if (step === 'welcome' || step === 'resume' && !resumeFileName) {
    return (
      <div className="co-right-card">
        {step === 'welcome' ? (
          <>
            <div className="co-illustration">
              <BusinessFigure />
              <span className="co-blob co-blob-a" />
              <span className="co-blob co-blob-b" />
            </div>
            <div className="co-right-copy">
              <h2>Accelerate Your Career</h2>
              <p>AI-powered resume tailoring, intelligent job tracking, and professional growth tools—all in one platform.</p>
              <div className="co-dots">
                <span /><span className="active" /><span /><span /><span />
              </div>
            </div>
          </>
        ) : (
          <div className="co-awaiting">
            <div className="co-awaiting-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24"><path d="M7 3h7l5 5v13H7z" /><path d="M14 3v5h5" /></svg>
            </div>
            <strong>Awaiting Resume</strong>
            <p>Upload your resume on the left, and we'll show a preview of extracted data here.</p>
          </div>
        )}
      </div>
    )
  }

  if (step === 'resume' && resumeFileName) {
    return (
      <div className="co-right-card">
        <div className="co-awaiting">
          <CheckIcon />
          <strong style={{ marginTop: '0.8rem' }}>{resumeFileName}</strong>
          <p>We'll parse this file and prefill your profile on the next step.</p>
        </div>
      </div>
    )
  }

  if (step === 'roles') {
    return (
      <div className="co-right-illus-only">
        <div className="co-illustration">
          <BusinessFigure />
          <span className="co-blob co-blob-a" />
          <span className="co-blob co-blob-b" />
        </div>
        <div className="co-right-copy">
          <h2>Target Profile Preview</h2>
          <p>Updating Live based on your selections.</p>
          <div className="co-dots">
            <span /><span /><span className="active" /><span /><span />
          </div>
        </div>
      </div>
    )
  }

  if (step === 'preferences') {
    const mode = (profile.work_modes || [])[0] || 'Remote'
    const emp = (profile.employment_types || [])[0] || 'Full-time'
    const auth = profile.visa_preferences?.work_authorization || 'US Citizen / Greencard'
    const min = profile.salary_min || 90000
    const max = profile.salary_max || 150000
    const excl = profile.quality_filters?.exclude_keywords || []
    return (
      <div className="co-summary-card">
        <div className="co-summary-head">
          <strong>Preference Summary</strong>
          <span className="co-live"><span className="co-live-dot" /> Updating Live</span>
        </div>
        <div className="co-summary-row">
          <span className="co-summary-icon">🌍</span>
          <div>
            <strong>{mode} Only</strong>
            <p>Anywhere in US</p>
          </div>
        </div>
        <div className="co-summary-row">
          <span className="co-summary-icon">💰</span>
          <div>
            <strong>${Math.round(min/1000)}k – ${max >= 150000 ? '150k+' : Math.round(max/1000) + 'k'}</strong>
            <p>Base Salary Expectation</p>
          </div>
        </div>
        <div className="co-summary-row">
          <span className="co-summary-icon">📄</span>
          <div>
            <strong>{emp}</strong>
            <p>{auth}</p>
          </div>
        </div>
        <div className="co-summary-section">
          <div className="co-summary-head">
            <span className="co-summary-sub">ACTIVE FILTERS</span>
            <button className="co-exclusions-link" type="button">{excl.length} Exclusions</button>
          </div>
          <div className="co-chip-row">
            {excl.map((k) => <span key={k} className="co-exclusion">{k}</span>)}
          </div>
        </div>
      </div>
    )
  }

  if (step === 'presets') {
    const checks = [
      ['Profile Details Completed', Boolean(profile.full_name || profile.target_roles?.length)],
      ['Resume Uploaded & Parsed', Boolean(resumeFileName)],
      ['Job Preferences Set', Boolean(profile.work_modes?.length)],
      ['Tracking Defaults Configured', Boolean(profile.tracking_defaults?.auto_status_updates)],
    ]
    return (
      <div className="co-summary-card">
        <div className="co-summary-head">
          <strong>System Status</strong>
          <span className="co-live"><span className="co-live-dot" /> Ready to Launch</span>
        </div>
        <div className="co-launch-card">
          <div className="co-launch-icon" aria-hidden="true">🚀</div>
          <strong>You're all set!</strong>
          <p>Your CareerOS workspace is configured and ready to supercharge your job search.</p>
        </div>
        <div className="co-checklist">
          {checks.map(([label, done]) => (
            <div key={label} className={`co-check-row ${done ? 'done' : ''}`}>
              <span className="co-check-dot">{done ? '✓' : ''}</span>
              <span>{label}</span>
            </div>
          ))}
        </div>
      </div>
    )
  }

  return null
}

export default OnboardingPage
