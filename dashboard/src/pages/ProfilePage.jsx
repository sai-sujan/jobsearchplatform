import { useMemo, useState } from 'react'

import { api } from '../lib/api'
import './ProfilePage.css'

const TABS = [
  { key: 'profile', label: 'Profile' },
  { key: 'preferences', label: 'Preferences' },
  { key: 'filters', label: 'Feed filters' },
  { key: 'presets', label: 'Search presets' },
  { key: 'resume', label: 'Resume' },
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
  onboarding_step: 'complete',
  automation_connected: false,
}

function splitCsv(value) {
  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
}

function toggleValue(list, value) {
  return list.includes(value) ? list.filter((item) => item !== value) : [...list, value]
}

function ProfilePage({ onboarding, onUpdated }) {
  const [activeTab, setActiveTab] = useState('profile')
  const [profile, setProfile] = useState({
    ...DEFAULT_PROFILE,
    full_name: onboarding?.user?.full_name || '',
    ...(onboarding?.profile || {}),
  })
  const [resumeText, setResumeText] = useState(onboarding?.resume?.original_text || '')
  const [excludeKeywordInput, setExcludeKeywordInput] = useState('')
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  const presets = onboarding?.search_presets || []
  const resume = onboarding?.resume

  const topRoles = useMemo(
    () => (profile.target_roles || []).filter(Boolean).slice(0, 2).join(' and '),
    [profile.target_roles],
  )

  const saveProfile = async () => {
    setSaving(true)
    setError('')
    setMessage('')
    try {
      const response = await api.put('/api/onboarding/profile', {
        ...profile,
        onboarding_step: 'complete',
      })
      onUpdated(response.data)
      setMessage('Profile updated.')
    } catch (requestError) {
      setError(requestError.response?.data?.detail || 'Unable to save your profile right now.')
    } finally {
      setSaving(false)
    }
  }

  const saveResume = async () => {
    setSaving(true)
    setError('')
    setMessage('')
    try {
      const response = await api.post('/api/onboarding/resume', {
        resume_text: resumeText,
        filename: 'resume.txt',
        content_type: 'text/plain',
      })
      setProfile((current) => ({
        ...current,
        parsed_skills: response.data.profile.parsed_skills || current.parsed_skills,
      }))
      onUpdated(response.data)
      setMessage('Resume updated.')
    } catch (requestError) {
      setError(requestError.response?.data?.detail || 'Unable to save your resume right now.')
    } finally {
      setSaving(false)
    }
  }

  const addExcludeKeyword = () => {
    if (!excludeKeywordInput.trim()) return
    setProfile((current) => ({
      ...current,
      quality_filters: {
        ...(current.quality_filters || {}),
        exclude_keywords: Array.from(
          new Set([...(current.quality_filters?.exclude_keywords || []), excludeKeywordInput.trim()]),
        ),
      },
    }))
    setExcludeKeywordInput('')
  }

  return (
    <section className="page-shell profile-shell">
      <header className="page-hero profile-hero">
        <div>
          <span className="eyebrow">Account workspace</span>
          <h1>{topRoles ? `Your setup for ${topRoles}` : 'Your job-matching profile'}</h1>
          <p>
            This account data controls which matched jobs appear in the web app, how roles are
            described, and how resume tailoring behaves when you open a recommendation.
          </p>
        </div>

        <div className="hero-metrics">
          <div className="hero-metric">
            <strong>{(profile.target_roles || []).length}</strong>
            <span>Target roles</span>
          </div>
          <div className="hero-metric">
            <strong>{(profile.parsed_skills || []).length}</strong>
            <span>Skills</span>
          </div>
          <div className="hero-metric">
            <strong>{presets.length}</strong>
            <span>Presets</span>
          </div>
        </div>
      </header>

      {(message || error) && (
        <div className={`profile-banner ${error ? 'error' : 'success'}`}>
          {error || message}
        </div>
      )}

      <div className="profile-workspace">
        <aside className="profile-tabs">
          {TABS.map((tab) => (
            <button
              key={tab.key}
              type="button"
              className={`profile-tab ${activeTab === tab.key ? 'active' : ''}`}
              onClick={() => setActiveTab(tab.key)}
            >
              {tab.label}
            </button>
          ))}
        </aside>

        <div className="profile-content">
          {activeTab === 'profile' && (
            <section className="profile-panel">
              <div className="profile-panel-head">
                <div>
                  <h2>Role profile</h2>
                  <p>Tell the app who you are targeting so matched jobs stay focused.</p>
                </div>
                <button type="button" className="primary-action" onClick={saveProfile} disabled={saving}>
                  {saving ? 'Saving...' : 'Save profile'}
                </button>
              </div>

              <div className="profile-form-grid">
                <label>
                  <span>Full name</span>
                  <input
                    value={profile.full_name || ''}
                    onChange={(event) => setProfile((current) => ({ ...current, full_name: event.target.value }))}
                  />
                </label>
                <label>
                  <span>Seniority</span>
                  <input
                    value={profile.seniority || ''}
                    onChange={(event) => setProfile((current) => ({ ...current, seniority: event.target.value }))}
                    placeholder="Entry level, Mid level, Senior"
                  />
                </label>
                <label className="profile-form-wide">
                  <span>Target roles</span>
                  <input
                    value={(profile.target_roles || []).join(', ')}
                    onChange={(event) =>
                      setProfile((current) => ({ ...current, target_roles: splitCsv(event.target.value) }))
                    }
                    placeholder="Frontend Engineer, Product Engineer"
                  />
                </label>
                <label className="profile-form-wide">
                  <span>Candidate summary</span>
                  <textarea
                    value={profile.candidate_summary || ''}
                    onChange={(event) =>
                      setProfile((current) => ({ ...current, candidate_summary: event.target.value }))
                    }
                    placeholder="Summarize the kind of work and strengths you want this product to optimize for."
                  />
                </label>
                <label className="profile-form-wide">
                  <span>Core skills</span>
                  <input
                    value={(profile.parsed_skills || []).join(', ')}
                    onChange={(event) =>
                      setProfile((current) => ({ ...current, parsed_skills: splitCsv(event.target.value) }))
                    }
                    placeholder="React, TypeScript, Python, SQL"
                  />
                </label>
              </div>
            </section>
          )}

          {activeTab === 'preferences' && (
            <section className="profile-panel">
              <div className="profile-panel-head">
                <div>
                  <h2>Job preferences</h2>
                  <p>These choices shape which roles make it into your matched feed.</p>
                </div>
                <button type="button" className="primary-action" onClick={saveProfile} disabled={saving}>
                  {saving ? 'Saving...' : 'Save preferences'}
                </button>
              </div>

              <div className="profile-form-grid">
                <label>
                  <span>Preferred locations</span>
                  <input
                    value={(profile.preferred_locations || []).join(', ')}
                    onChange={(event) =>
                      setProfile((current) => ({
                        ...current,
                        preferred_locations: splitCsv(event.target.value),
                      }))
                    }
                    placeholder="Chicago, Remote, New York"
                  />
                </label>
                <label>
                  <span>Work modes</span>
                  <input
                    value={(profile.work_modes || []).join(', ')}
                    onChange={(event) =>
                      setProfile((current) => ({ ...current, work_modes: splitCsv(event.target.value) }))
                    }
                    placeholder="Remote, Hybrid"
                  />
                </label>
                <label>
                  <span>Employment types</span>
                  <input
                    value={(profile.employment_types || []).join(', ')}
                    onChange={(event) =>
                      setProfile((current) => ({
                        ...current,
                        employment_types: splitCsv(event.target.value),
                      }))
                    }
                    placeholder="Full-time, Internship"
                  />
                </label>
                <label>
                  <span>Industries</span>
                  <input
                    value={(profile.industries || []).join(', ')}
                    onChange={(event) =>
                      setProfile((current) => ({ ...current, industries: splitCsv(event.target.value) }))
                    }
                    placeholder="SaaS, Healthcare, Consumer"
                  />
                </label>
                <label>
                  <span>Salary expectations</span>
                  <input
                    value={profile.salary_expectations || ''}
                    onChange={(event) =>
                      setProfile((current) => ({ ...current, salary_expectations: event.target.value }))
                    }
                    placeholder="120k+"
                  />
                </label>
                <label className="profile-checkbox">
                  <input
                    type="checkbox"
                    checked={!profile.visa_preferences?.requires_sponsorship}
                    onChange={(event) =>
                      setProfile((current) => ({
                        ...current,
                        visa_preferences: {
                          ...(current.visa_preferences || {}),
                          requires_sponsorship: !event.target.checked,
                        },
                      }))
                    }
                  />
                  <span>I do not need employer sponsorship.</span>
                </label>
              </div>
            </section>
          )}

          {activeTab === 'filters' && (
            <section className="profile-panel">
              <div className="profile-panel-head">
                <div>
                  <h2>Recommendation filters</h2>
                  <p>Give users direct control over source quality, fit threshold, and noisy-job filters.</p>
                </div>
                <button type="button" className="primary-action" onClick={saveProfile} disabled={saving}>
                  {saving ? 'Saving...' : 'Save filters'}
                </button>
              </div>

              <div className="profile-form-grid">
                <label className="profile-form-wide">
                  <span>Preferred sources</span>
                  <div className="profile-chip-row">
                    {['LinkedIn', 'Indeed', 'Glassdoor', 'Company Site'].map((source) => (
                      <button
                        key={source}
                        type="button"
                        className={`filter-chip ${profile.quality_filters?.preferred_sources?.includes(source) ? 'selected' : ''}`}
                        onClick={() =>
                          setProfile((current) => ({
                            ...current,
                            quality_filters: {
                              ...(current.quality_filters || {}),
                              preferred_sources: toggleValue(current.quality_filters?.preferred_sources || [], source),
                            },
                          }))
                        }
                      >
                        {source}
                      </button>
                    ))}
                  </div>
                </label>

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

                <div className="profile-form-wide profile-toggle-grid">
                  {[
                    ['include_stretch_roles', 'Include stretch roles'],
                    ['hide_staffing_agencies', 'Hide staffing agencies'],
                    ['hide_suspicious_jobs', 'Hide suspicious listings'],
                    ['exclude_recruiter_posts', 'Hide recruiter-style posts'],
                    ['require_salary_visibility', 'Only show jobs with salary'],
                  ].map(([key, label]) => (
                    <label key={key} className="profile-checkbox-card profile-toggle-card">
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

                <label className="profile-form-wide">
                  <span>Exclude keywords</span>
                  <div className="profile-inline-input">
                    <input
                      value={excludeKeywordInput}
                      onChange={(event) => setExcludeKeywordInput(event.target.value)}
                      placeholder="commission-only, staffing, relocation required"
                    />
                    <button type="button" className="secondary-action" onClick={addExcludeKeyword}>
                      Add keyword
                    </button>
                  </div>
                  <div className="profile-chip-row">
                    {(profile.quality_filters?.exclude_keywords || []).map((keyword) => (
                      <span key={keyword} className="job-skill-chip">
                        {keyword}
                      </span>
                    ))}
                  </div>
                </label>
              </div>
            </section>
          )}

          {activeTab === 'presets' && (
            <section className="profile-panel">
              <div className="profile-panel-head">
                <div>
                  <h2>Generated search presets</h2>
                  <p>These are the role-aware searches that drive your account’s matched-job feed.</p>
                </div>
                <button type="button" className="secondary-action" onClick={saveProfile} disabled={saving}>
                  Refresh presets
                </button>
              </div>

              <div className="preset-list">
                {presets.length > 0 ? (
                  presets.map((preset) => (
                    <article key={preset.id || preset.label} className="preset-card">
                      <div className="preset-card-header">
                        <strong>{preset.label}</strong>
                        {preset.is_default && <span className="preset-pill">Default</span>}
                      </div>
                      <p>{(preset.keywords || []).join(' • ')}</p>
                      <div className="preset-meta">
                        <span>{(preset.locations || []).join(', ') || 'Anywhere'}</span>
                        <span>{(preset.work_modes || []).join(', ') || 'Any work mode'}</span>
                      </div>
                    </article>
                  ))
                ) : (
                  <p className="profile-muted">Save your profile to generate presets for matched-job delivery.</p>
                )}
              </div>
            </section>
          )}

          {activeTab === 'resume' && (
            <section className="profile-panel">
              <div className="profile-panel-head">
                <div>
                  <h2>Resume source</h2>
                  <p>Your default resume powers matching and later tailoring for each job detail view.</p>
                </div>
                <button
                  type="button"
                  className="primary-action"
                  onClick={saveResume}
                  disabled={saving || resumeText.trim().length < 50}
                >
                  {saving ? 'Saving...' : 'Save resume'}
                </button>
              </div>

              <p className="profile-muted">
                {resume?.filename || 'Paste your resume text below. A file uploader can be added next.'}
              </p>
              <textarea
                className="profile-resume-editor"
                value={resumeText}
                onChange={(event) => setResumeText(event.target.value)}
                placeholder="Paste your resume text here..."
              />

              <div className="profile-chip-row">
                {(profile.parsed_skills || []).map((skill) => (
                  <span key={skill} className="job-skill-chip">
                    {skill}
                  </span>
                ))}
              </div>
            </section>
          )}

        </div>
      </div>
    </section>
  )
}

export default ProfilePage
