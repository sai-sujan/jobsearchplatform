import { useEffect, useState } from 'react'
import './Settings.css'
import { api } from '../lib/api'
import {
  DEFAULT_EEO,
  DISABILITY_STATUS_OPTIONS,
  GENDER_OPTIONS,
  RACE_ETHNICITY_OPTIONS,
  VETERAN_STATUS_OPTIONS,
} from '../lib/eeo'

const TABS = [
  { key: 'profile', label: 'Profile', hint: 'Contact info, address, compensation, and work authorization — used for deterministic autofill.' },
  { key: 'personal_disclosures', label: 'EEO / Disclosures', hint: 'Voluntary EEO responses auto-filled on job applications.' },
  { key: 'notifications', label: 'Notifications', hint: 'Control which alerts and summaries you receive.' },
  { key: 'job_config', label: 'Search config', hint: 'Roles, locations, skills, compensation, and matching filters.' },
  { key: 'env', label: 'Environment', hint: 'Keys, browser paths, and runtime configuration.' },
  { key: 'company_blacklist', label: 'Blacklist', hint: 'Companies and keywords to exclude.' },
  { key: 'your_skills', label: 'Skills', hint: 'Candidate skill inventory used during matching.' },
  { key: 'resume', label: 'Resume', hint: 'Plain-text master resume used for evaluation.' },
]

const NOTIFICATION_KEYS = ['new_matches', 'application_updates', 'interview_reminders', 'weekly_summary', 'ai_recommendations']
const NOTIFICATION_LABELS = {
  new_matches: { label: 'New job matches', sub: 'Get notified when new jobs match your criteria' },
  application_updates: { label: 'Application updates', sub: 'Status changes and recruiter responses' },
  interview_reminders: { label: 'Interview reminders', sub: 'Reminders before scheduled interviews' },
  weekly_summary: { label: 'Weekly summary', sub: 'Weekly digest of your application pipeline' },
  ai_recommendations: { label: 'AI recommendations', sub: 'Personalized job and resume suggestions' },
}
const DEFAULT_NOTIFICATIONS = {
  new_matches: true,
  application_updates: true,
  interview_reminders: true,
  weekly_summary: false,
  ai_recommendations: true,
}

function loadNotifications() {
  try {
    const stored = localStorage.getItem('notificationPrefs')
    if (stored) return JSON.parse(stored)
  } catch {
    return DEFAULT_NOTIFICATIONS
  }
  return DEFAULT_NOTIFICATIONS
}

const DEFAULT_SEARCH_PROFILE = {
  target_roles: [],
  seniority: '',
  preferred_locations: [],
  work_modes: [],
  employment_types: [],
  industries: [],
  visa_preferences: {},
  quality_filters: {},
  salary_expectations: '',
  candidate_summary: '',
  parsed_skills: [],
  onboarding_step: 'complete',
  automation_connected: false,
}

const WORK_MODE_OPTIONS = ['Remote', 'Hybrid', 'On-site']
const EMPLOYMENT_TYPE_OPTIONS = ['Full-time', 'Internship', 'Contract', 'Part-time']
const SENIORITY_OPTIONS = ['Internship', 'Entry level', 'Associate', 'Mid-level', 'Senior']

function normalizeList(value) {
  return Array.isArray(value) ? value.filter(Boolean) : []
}

function buildSearchProfile(profile = {}) {
  return {
    ...DEFAULT_SEARCH_PROFILE,
    ...profile,
    target_roles: normalizeList(profile.target_roles),
    preferred_locations: normalizeList(profile.preferred_locations),
    work_modes: normalizeList(profile.work_modes),
    employment_types: normalizeList(profile.employment_types),
    industries: normalizeList(profile.industries),
    parsed_skills: normalizeList(profile.parsed_skills),
    visa_preferences: profile.visa_preferences || {},
    quality_filters: profile.quality_filters || {},
    onboarding_step: profile.onboarding_step || 'complete',
    automation_connected: !!profile.automation_connected,
  }
}

const EDUCATION_OPTIONS = [
  'High School / GED', "Associate's Degree", "Bachelor's Degree",
  "Master's Degree", 'Doctorate / PhD', 'Bootcamp / Certificate', 'Self-taught',
]
const VISA_OPTIONS = ['US Citizen', 'Green Card', 'OPT', 'CPT', 'H-1B', 'TN', 'L-1', 'F-1', 'Other']
const YOE_OPTIONS = ['0','1','2','3','4','5','6','7','8','9','10','10+']

function Settings({ onboarding, onUpdated }) {
  const [config, setConfig] = useState({
    env: '',
    job_config: {},
    company_blacklist: '',
    your_skills: '',
    resume: '',
  })
  const [editedConfig, setEditedConfig] = useState({})
  const [activeTab, setActiveTab] = useState('profile')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [resumeAsset, setResumeAsset] = useState(null)   // { id, filename, original_text }
  const [resumeUploading, setResumeUploading] = useState(false)
  const [eeo, setEeo] = useState({ 
    ...DEFAULT_EEO, 
    ...(onboarding?.profile?.full_profile?.eeo_voluntary || onboarding?.profile?.eeo_voluntary || {})
  })
  const [fp, setFp] = useState(onboarding?.profile?.full_profile || {})
  const [searchProfile, setSearchProfile] = useState(() => buildSearchProfile(onboarding?.profile || {}))
  const [notifications, setNotifications] = useState(loadNotifications)
  const [profileLoaded, setProfileLoaded] = useState(!!onboarding)

  useEffect(() => {
    if (!onboarding?.profile) return
    setSearchProfile(buildSearchProfile(onboarding.profile))
    setFp(onboarding.profile.full_profile || {})
    setEeo({
      ...DEFAULT_EEO,
      ...(onboarding.profile.full_profile?.eeo_voluntary || onboarding.profile.eeo_voluntary || {}),
    })
    setProfileLoaded(true)
  }, [onboarding])

  useEffect(() => {
    const fetchConfig = async () => {
      try {
        const response = await api.get('/api/config')
        setConfig(response.data)
        setEditedConfig(response.data)
        setError('')
      } catch (requestError) {
        if (requestError.response?.status !== 410) {
          setError('Unable to load configuration. Make sure the API server is running.')
        }
      } finally {
        setLoading(false)
      }
    }
    fetchConfig()
  }, [])

  useEffect(() => {
    if (activeTab !== 'personal_disclosures' && activeTab !== 'profile' && activeTab !== 'job_config' && activeTab !== 'resume') return
    api.get('/api/onboarding').then((res) => {
      const profile = res.data?.profile || {}
      const saved = res.data?.profile?.full_profile?.eeo_voluntary || res.data?.profile?.eeo_voluntary || {}
      setEeo({ ...DEFAULT_EEO, ...saved })
      setSearchProfile(buildSearchProfile(profile))
      if (res.data?.resume) setResumeAsset(res.data.resume)
      if (!profileLoaded) {
        setFp(profile.full_profile || {})
        setProfileLoaded(true)
      }
    }).catch(() => {})
  }, [activeTab, profileLoaded])

  const activeMeta = TABS.find((tab) => tab.key === activeTab)

  const handleTextChange = (configType, value) => {
    setEditedConfig((current) => ({ ...current, [configType]: value }))
  }

  const buildOnboardingPayload = (overrides = {}) => ({
    ...searchProfile,
    ...overrides,
    target_roles: normalizeList(overrides.target_roles ?? searchProfile.target_roles),
    preferred_locations: normalizeList(overrides.preferred_locations ?? searchProfile.preferred_locations),
    work_modes: normalizeList(overrides.work_modes ?? searchProfile.work_modes),
    employment_types: normalizeList(overrides.employment_types ?? searchProfile.employment_types),
    industries: normalizeList(overrides.industries ?? searchProfile.industries),
    parsed_skills: normalizeList(overrides.parsed_skills ?? searchProfile.parsed_skills),
    visa_preferences: overrides.visa_preferences ?? searchProfile.visa_preferences ?? {},
    quality_filters: overrides.quality_filters ?? searchProfile.quality_filters ?? {},
    onboarding_step: overrides.onboarding_step ?? searchProfile.onboarding_step ?? 'complete',
    automation_connected: overrides.automation_connected ?? searchProfile.automation_connected ?? false,
  })

  const applyOnboardingResponse = (nextState) => {
    if (!nextState?.profile) return
    setSearchProfile(buildSearchProfile(nextState.profile))
    setFp(nextState.profile.full_profile || {})
    setEeo({
      ...DEFAULT_EEO,
      ...(nextState.profile.full_profile?.eeo_voluntary || nextState.profile.eeo_voluntary || {}),
    })
    if (onUpdated) onUpdated(nextState)
  }

  const handleResumeUpload = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''
    setResumeUploading(true)
    setError('')
    try {
      const form = new FormData()
      form.append('file', file)
      const res = await api.post('/api/onboarding/resume', form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      if (res.data?.resume) setResumeAsset(res.data.resume)
      setMessage(`Resume uploaded: ${file.name}`)
      setTimeout(() => setMessage(''), 4000)
    } catch (err) {
      setError(err.response?.data?.detail || 'Upload failed.')
    } finally {
      setResumeUploading(false)
    }
  }

  const saveConfig = async () => {
    try {
      setSaving(true)
      setError('')

      if (activeTab === 'personal_disclosures') {
        const response = await api.put('/api/onboarding/profile', buildOnboardingPayload({ full_profile: { eeo_voluntary: eeo } }))
        applyOnboardingResponse(response.data)
        setMessage('EEO disclosures saved.')
        setTimeout(() => setMessage(''), 3000)
        return
      }

      if (activeTab === 'profile') {
        const p = fp.personal || {}
        const derivedFullName = [p.first_name, p.last_name].filter(Boolean).join(' ') || p.full_name || p.preferred_name || onboarding?.user?.full_name || ''
        const response = await api.put('/api/onboarding/profile', buildOnboardingPayload({
          full_name: derivedFullName,
          full_profile: { ...fp, personal: { ...p, full_name: derivedFullName } },
        }))
        applyOnboardingResponse(response.data)
        setMessage('Profile saved.')
        setTimeout(() => setMessage(''), 3000)
        return
      }

      if (activeTab === 'job_config') {
        const response = await api.put('/api/onboarding/profile', buildOnboardingPayload())
        applyOnboardingResponse(response.data)
        setMessage('Search preferences saved.')
        setTimeout(() => setMessage(''), 3000)
        return
      }

      if (activeTab === 'notifications') {
        localStorage.setItem('notificationPrefs', JSON.stringify(notifications))
        setMessage('Notification preferences saved.')
        setTimeout(() => setMessage(''), 3000)
        return
      }

      const payload =
        activeTab === 'job_config'
          ? { config_type: activeTab, data: editedConfig.job_config }
          : { config_type: activeTab, content: editedConfig[activeTab] || '' }

      const response = await api.post('/api/config', payload)
      setConfig((current) => ({ ...current, [activeTab]: editedConfig[activeTab] }))
      setMessage(response.data.message || 'Saved.')
      setTimeout(() => setMessage(''), 3000)
    } catch (requestError) {
      setError(requestError.response?.data?.detail || 'Failed to save configuration.')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <section className="settings-shell">
        <div className="settings-loading">Loading workspace configuration...</div>
      </section>
    )
  }

  return (
    <section className="settings-shell">
      <header className="settings-hero">
        <div>
          <span className="eyebrow">Workspace setup</span>
          <h1>Configure the search engine, candidate profile, and runtime safely.</h1>
          <p>These values still live on local disk today, so treat this as operator-facing settings rather than end-user account management.</p>
        </div>
        <div className="settings-hero-note">
          <span>Current panel</span>
          <strong>{activeMeta?.label}</strong>
          <p>{activeMeta?.hint}</p>
        </div>
      </header>

      {message && <div className="settings-banner success">{message}</div>}
      {error && <div className="settings-banner error">{error}</div>}

      <div className="settings-layout">
        <aside className="settings-tabs">
          {TABS.map((tab) => (
            <button
              key={tab.key}
              className={`settings-tab ${activeTab === tab.key ? 'active' : ''}`}
              onClick={() => setActiveTab(tab.key)}
            >
              <strong>{tab.label}</strong>
              <span>{tab.hint}</span>
            </button>
          ))}
        </aside>

        <div className="settings-panel">
          <div className="settings-panel-header">
            <h2>{activeMeta?.label}</h2>
            <p>{activeMeta?.hint}</p>
          </div>

          {activeTab === 'profile' && (
            <ProfileSettingsTab fp={fp} setFp={setFp} />
          )}

          {activeTab === 'job_config' && (
            <SearchConfigTab searchProfile={searchProfile} setSearchProfile={setSearchProfile} />
          )}

          {activeTab === 'env' && (
            <textarea
              value={editedConfig.env || ''}
              onChange={(event) => handleTextChange('env', event.target.value)}
              className="settings-editor"
              spellCheck={false}
            />
          )}

          {activeTab === 'company_blacklist' && (
            <textarea
              value={editedConfig.company_blacklist || ''}
              onChange={(event) => handleTextChange('company_blacklist', event.target.value)}
              className="settings-editor"
              spellCheck={false}
            />
          )}

          {activeTab === 'your_skills' && (
            <textarea
              value={editedConfig.your_skills || ''}
              onChange={(event) => handleTextChange('your_skills', event.target.value)}
              className="settings-editor"
              spellCheck={false}
            />
          )}

          {activeTab === 'resume' && (
            <div className="resume-tab">
              <div className="resume-upload-bar">
                <div className="resume-meta">
                  {resumeAsset
                    ? <><span className="resume-filename">{resumeAsset.filename || 'Uploaded resume'}</span><span className="resume-skills-count">{resumeAsset.parsed_skills?.length || 0} skills parsed</span></>
                    : <span className="resume-filename resume-filename--none">No resume uploaded yet</span>
                  }
                </div>
                <label className="resume-upload-btn">
                  {resumeUploading ? 'Uploading...' : resumeAsset ? 'Replace resume' : 'Upload resume'}
                  <input
                    type="file"
                    accept=".pdf,.docx,.doc,.txt"
                    style={{ display: 'none' }}
                    onChange={handleResumeUpload}
                    disabled={resumeUploading}
                  />
                </label>
              </div>
              {resumeAsset?.original_text && (
                <textarea
                  value={resumeAsset.original_text}
                  readOnly
                  className="settings-editor settings-editor-resume"
                  spellCheck={false}
                />
              )}
              {!resumeAsset && (
                <div className="resume-empty-state">
                  Upload a PDF, DOCX, or TXT resume. It will be used for keyword gap analysis and AI matching.
                </div>
              )}
            </div>
          )}

          {activeTab === 'notifications' && (
            <div className="notification-list" style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', padding: '0.25rem 0' }}>
              {NOTIFICATION_KEYS.map((key) => (
                <label key={key} className="notification-row" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 14px', border: '1px solid var(--border)', borderRadius: '8px', background: 'var(--surface)' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <strong style={{ fontSize: '14px', color: 'var(--text)' }}>{NOTIFICATION_LABELS[key].label}</strong>
                    <small style={{ fontSize: '12px', color: 'var(--muted)' }}>{NOTIFICATION_LABELS[key].sub}</small>
                  </div>
                  <input
                    type="checkbox"
                    className="co-switch"
                    checked={!!notifications[key]}
                    onChange={(event) => setNotifications((prev) => ({ ...prev, [key]: event.target.checked }))}
                  />
                </label>
              ))}
            </div>
          )}

          {activeTab === 'personal_disclosures' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', padding: '0.25rem 0' }}>
              <p style={{ color: 'var(--muted)', fontSize: '13px', margin: 0 }}>
                These voluntary responses are used to auto-fill EEO forms on job applications. All fields default to &ldquo;prefer not to answer.&rdquo;
              </p>
              {[
                { label: 'Gender', key: 'gender', options: GENDER_OPTIONS },
                { label: 'Race / Ethnicity', key: 'race_ethnicity', options: RACE_ETHNICITY_OPTIONS },
                { label: 'Veteran Status', key: 'veteran_status', options: VETERAN_STATUS_OPTIONS },
                { label: 'Disability Status', key: 'disability_status', options: DISABILITY_STATUS_OPTIONS },
              ].map(({ label, key, options }) => (
                <div key={key} style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                    {label}
                  </label>
                  <select
                    value={eeo[key] || ''}
                    onChange={(e) => setEeo((prev) => ({ ...prev, [key]: e.target.value }))}
                    style={{ padding: '8px 10px', border: '1px solid var(--border)', borderRadius: '6px', fontSize: '13px', background: '#fff', outline: 'none' }}
                  >
                    {options.map((o) => <option key={o} value={o}>{o}</option>)}
                  </select>
                </div>
              ))}
            </div>
          )}

          <div className="settings-actions">
            <button className="primary-action" onClick={saveConfig} disabled={saving}>
              {saving ? 'Saving...' : 'Save changes'}
            </button>
            <button
              className="secondary-action"
              onClick={() => {
                setEditedConfig(config)
                setSearchProfile(buildSearchProfile(onboarding?.profile || {}))
                setFp(onboarding?.profile?.full_profile || {})
                setEeo({
                  ...DEFAULT_EEO,
                  ...(onboarding?.profile?.full_profile?.eeo_voluntary || onboarding?.profile?.eeo_voluntary || {}),
                })
                setError('')
                setMessage('')
              }}
            >
              Reset panel
            </button>
          </div>
        </div>
      </div>
    </section>
  )
}

function ChoicePills({ options, selected, onChange }) {
  const selectedSet = new Set(selected || [])
  return (
    <div className="sc-choice-row">
      {options.map((option) => (
        <button
          key={option}
          type="button"
          className={`sc-choice ${selectedSet.has(option) ? 'active' : ''}`}
          onClick={() => {
            const next = selectedSet.has(option)
              ? (selected || []).filter((item) => item !== option)
              : [...(selected || []), option]
            onChange(next)
          }}
        >
          {option}
        </button>
      ))}
    </div>
  )
}

function ChipListField({ title, description, placeholder, items, onChange }) {
  const [draft, setDraft] = useState('')
  const addDraft = () => {
    const value = draft.trim()
    if (!value) return
    onChange(Array.from(new Set([...(items || []), value])))
    setDraft('')
  }

  return (
    <section className="sc-card">
      <div className="sc-card-title">
        <h3>{title}</h3>
        <p>{description}</p>
      </div>
      <div className="sc-chip-row">
        {(items || []).map((item) => (
          <button
            key={item}
            type="button"
            className="sc-chip"
            onClick={() => onChange((items || []).filter((current) => current !== item))}
            title={`Remove ${item}`}
          >
            <span>{item}</span>
            <strong aria-hidden="true">x</strong>
          </button>
        ))}
      </div>
      <div className="sc-inline-input">
        <input
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault()
              addDraft()
            }
          }}
          placeholder={placeholder}
        />
        <button type="button" onClick={addDraft} aria-label={`Add ${title.toLowerCase()}`}>
          +
        </button>
      </div>
    </section>
  )
}

function SearchConfigTab({ searchProfile, setSearchProfile }) {
  const setField = (key, value) => {
    setSearchProfile((current) => ({ ...current, [key]: value }))
  }

  return (
    <div className="sc-grid">
      <ChipListField
        title="Target roles"
        description="Job titles that should drive recommendations and saved searches."
        placeholder="Add a role, e.g. AI Engineer"
        items={searchProfile.target_roles}
        onChange={(items) => setField('target_roles', items)}
      />

      <ChipListField
        title="Preferred locations"
        description="Cities, states, or remote preferences used during matching."
        placeholder="Add a location, e.g. Remote"
        items={searchProfile.preferred_locations}
        onChange={(items) => setField('preferred_locations', items)}
      />

      <ChipListField
        title="Key skills"
        description="Skills the scorer should treat as important evidence."
        placeholder="Add a skill, e.g. FastAPI"
        items={searchProfile.parsed_skills}
        onChange={(items) => setField('parsed_skills', items)}
      />

      <section className="sc-card">
        <div className="sc-card-title">
          <h3>Role filters</h3>
          <p>Fast toggles for seniority, work mode, employment type, and industry focus.</p>
        </div>
        <div className="sc-field-grid">
          <Field label="Seniority">
            <select className="sp-input" value={searchProfile.seniority || ''} onChange={(event) => setField('seniority', event.target.value)}>
              <option value="">Any seniority</option>
              {SENIORITY_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}
            </select>
          </Field>
          <Field label="Target compensation">
            <input
              className="sp-input"
              value={searchProfile.salary_expectations || ''}
              onChange={(event) => setField('salary_expectations', event.target.value)}
              placeholder="$90,000 - $130,000"
            />
          </Field>
        </div>
        <Field label="Work modes">
          <ChoicePills options={WORK_MODE_OPTIONS} selected={searchProfile.work_modes} onChange={(items) => setField('work_modes', items)} />
        </Field>
        <Field label="Employment types">
          <ChoicePills options={EMPLOYMENT_TYPE_OPTIONS} selected={searchProfile.employment_types} onChange={(items) => setField('employment_types', items)} />
        </Field>
      </section>

      <ChipListField
        title="Industries"
        description="Optional focus areas for saved searches and ranking context."
        placeholder="Add an industry, e.g. Healthcare"
        items={searchProfile.industries}
        onChange={(items) => setField('industries', items)}
      />

      <section className="sc-card sc-card-wide">
        <div className="sc-card-title">
          <h3>Candidate summary</h3>
          <p>Short context used by AI matching and resume tailoring.</p>
        </div>
        <textarea
          className="sp-input sp-textarea sc-summary"
          value={searchProfile.candidate_summary || ''}
          onChange={(event) => setField('candidate_summary', event.target.value)}
          placeholder="Summarize your target roles, strongest skills, and constraints."
        />
      </section>
    </div>
  )
}

function Field({ label, children }) {
  return (
    <div className="sp-field">
      <label className="sp-label">{label}</label>
      {children}
    </div>
  )
}

function ProfileSettingsTab({ fp, setFp }) {
  const personal     = fp.personal          || {}
  const workAuth     = fp.work_authorization || {}
  const experience   = fp.experience         || {}
  const compensation = fp.compensation       || {}

  const set = (section, key, val) =>
    setFp(c => ({ ...c, [section]: { ...(c[section] || {}), [key]: val } }))

  const inp = (section, key, placeholder, type = 'text') => {
    const obj = section === 'personal' ? personal : section === 'work_authorization' ? workAuth : section === 'experience' ? experience : compensation
    return (
      <input
        type={type}
        className="sp-input"
        placeholder={placeholder}
        value={obj[key] ?? ''}
        onChange={e => set(section, key, e.target.value)}
      />
    )
  }

  const sel = (section, key, options, placeholder) => {
    const obj = section === 'experience' ? experience : section === 'work_authorization' ? workAuth : compensation
    return (
      <select className="sp-input" value={obj[key] ?? ''} onChange={e => set(section, key, e.target.value)}>
        <option value="">{placeholder}</option>
        {options.map(o => <option key={o} value={o}>{o}</option>)}
      </select>
    )
  }

  const toggle = (section, key, trueLabel, falseLabel) => {
    const obj = section === 'work_authorization' ? workAuth : {}
    return (
      <div className="sp-toggle-row">
        {[true, false].map(v => (
          <button key={String(v)} type="button"
            className={`sp-toggle-btn ${obj[key] === v ? 'active' : ''}`}
            onClick={() => set(section, key, v)}>
            {v ? trueLabel : falseLabel}
          </button>
        ))}
      </div>
    )
  }

  return (
    <div className="sp-grid">

      <div className="sp-card">
        <div className="sp-card-title">Personal Info</div>
        <div className="sp-row">
          <Field label="First Name">{inp('personal', 'first_name', 'First name')}</Field>
          <Field label="Last Name">{inp('personal', 'last_name', 'Last name')}</Field>
        </div>
        <Field label="Preferred / Display Name">{inp('personal', 'preferred_name', 'e.g. Sujan')}</Field>
        <div className="sp-row">
          <Field label="Email">{inp('personal', 'email', 'you@example.com', 'email')}</Field>
          <Field label="Phone">{inp('personal', 'phone', '+1 555-000-0000', 'tel')}</Field>
        </div>
      </div>

      <div className="sp-card">
        <div className="sp-card-title">Address</div>
        <div className="sp-row">
          <Field label="Street Address">{inp('personal', 'street_address', '123 Main St')}</Field>
          <Field label="Apt / Suite" >{inp('personal', 'apartment', 'Apt 304')}</Field>
        </div>
        <div className="sp-row sp-row-3">
          <Field label="City">{inp('personal', 'city', 'Springfield')}</Field>
          <Field label="State (full)">{inp('personal', 'province_state', 'Missouri')}</Field>
          <Field label="State Abbr">{inp('personal', 'state_abbreviation', 'MO')}</Field>
        </div>
        <div className="sp-row">
          <Field label="ZIP / Postal Code">{inp('personal', 'postal_code', '65806')}</Field>
          <Field label="Country">{inp('personal', 'country', 'United States')}</Field>
        </div>
      </div>

      <div className="sp-card">
        <div className="sp-card-title">Online Presence</div>
        <Field label="LinkedIn URL">{inp('personal', 'linkedin_url', 'https://linkedin.com/in/…', 'url')}</Field>
        <Field label="GitHub URL">{inp('personal', 'github_url', 'https://github.com/…', 'url')}</Field>
        <Field label="Portfolio / Website">{inp('personal', 'portfolio_url', 'https://yoursite.com', 'url')}</Field>
      </div>

      <div className="sp-card">
        <div className="sp-card-title">Work Authorization</div>
        <div className="sp-row">
          <Field label="Authorized to work in USA?">
            {toggle('work_authorization', 'legally_authorized_to_work', 'Yes', 'No')}
          </Field>
          <Field label="Requires sponsorship?">
            <div className="sp-toggle-row">
              {[false, true].map(v => (
                <button key={String(v)} type="button"
                  className={`sp-toggle-btn ${workAuth.require_sponsorship === v ? 'active' : ''}`}
                  onClick={() => set('work_authorization', 'require_sponsorship', v)}>
                  {v ? 'Yes' : 'No'}
                </button>
              ))}
            </div>
          </Field>
        </div>
        <Field label="Visa / Work Permit Type">
          {sel('work_authorization', 'work_permit_type', VISA_OPTIONS, 'Select visa type…')}
        </Field>
      </div>

      <div className="sp-card">
        <div className="sp-card-title">Experience &amp; Education</div>
        <div className="sp-row">
          <Field label="Years of Experience">
            {sel('experience', 'years_of_experience_total', YOE_OPTIONS, 'Select…')}
          </Field>
          <Field label="Highest Education">
            {sel('experience', 'education_level', EDUCATION_OPTIONS, 'Select…')}
          </Field>
        </div>
        <Field label="Current / Most Recent Job Title">
          {inp('experience', 'current_title', 'e.g. AI Engineer')}
        </Field>
      </div>

      <div className="sp-card">
        <div className="sp-card-title">Compensation</div>
        <Field label="Desired Salary (USD)">{inp('compensation', 'salary_expectation', '95000', 'number')}</Field>
        <div className="sp-row">
          <Field label="Range — Min">{inp('compensation', 'salary_range_min', '90000', 'number')}</Field>
          <Field label="Range — Max">{inp('compensation', 'salary_range_max', '130000', 'number')}</Field>
        </div>
        <Field label="Salary Note (optional)">
          <textarea className="sp-input sp-textarea"
            placeholder="e.g. For high cost-of-living cities, aim for upper third of range."
            value={compensation.currency_conversion_note ?? ''}
            onChange={e => set('compensation', 'currency_conversion_note', e.target.value)}
          />
        </Field>
      </div>

    </div>
  )
}

export default Settings
