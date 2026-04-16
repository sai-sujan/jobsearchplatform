import { useState } from 'react'

import { api } from '../lib/api'
import './ProfilePage.css'

const DEFAULT_PROFILE = {
  full_name: '',
  target_roles: [],
  preferred_locations: [],
  parsed_skills: [],
  salary_expectations: '',
}

function splitCsv(value) {
  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
}

function ProfilePage({ onboarding, onUpdated }) {
  const [activeTab, setActiveTab] = useState('search')
  const [profile, setProfile] = useState({
    ...DEFAULT_PROFILE,
    full_name: onboarding?.user?.full_name || '',
    ...(onboarding?.profile || {}),
  })
  const [newTitle, setNewTitle] = useState('')
  const [newSkill, setNewSkill] = useState('')
  const [resumeText, setResumeText] = useState(onboarding?.resume?.original_text || '')
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')

  const updateList = (field, values) => setProfile((current) => ({ ...current, [field]: values }))

  const saveProfile = async () => {
    setSaving(true)
    setMessage('')
    try {
      const response = await api.put('/api/onboarding/profile', {
        ...profile,
        onboarding_step: 'complete',
      })
      onUpdated(response.data)
      setMessage('Saved')
    } finally {
      setSaving(false)
    }
  }

  const saveResume = async () => {
    setSaving(true)
    setMessage('')
    try {
      const response = await api.post('/api/onboarding/resume', {
        resume_text: resumeText,
        filename: 'resume.txt',
        content_type: 'text/plain',
      })
      onUpdated(response.data)
      setMessage('Resume saved')
    } finally {
      setSaving(false)
    }
  }

  const addItem = (field, value, setter) => {
    const clean = value.trim()
    if (!clean) return
    updateList(field, Array.from(new Set([...(profile[field] || []), clean])))
    setter('')
  }

  return (
    <section className="settings-page">
      <header className="settings-page-header">
        <h1>Settings</h1>
        <p>Manage your search preferences and profile</p>
      </header>

      {message && <div className="settings-toast">{message}</div>}

      <nav className="settings-tabbar" aria-label="Settings sections">
        {[
          ['search', '⌕', 'Search Config'],
          ['profile', '♙', 'Profile'],
          ['notifications', '◌', 'Notifications'],
          ['resume', '□', 'Resume'],
        ].map(([key, icon, label]) => (
          <button
            key={key}
            type="button"
            className={activeTab === key ? 'active' : ''}
            onClick={() => setActiveTab(key)}
          >
            <span>{icon}</span>
            {label}
          </button>
        ))}
      </nav>

      {activeTab === 'search' && (
        <div className="settings-stack">
          <section className="settings-card">
            <div className="settings-card-title">
              <span>▣</span>
              <div>
                <h2>Target Job Titles</h2>
                <p>Jobs matching these titles will be prioritized</p>
              </div>
            </div>
            <div className="settings-chip-row">
              {(profile.target_roles || []).map((role) => (
                <button
                  key={role}
                  type="button"
                  className="settings-chip"
                  onClick={() => updateList('target_roles', profile.target_roles.filter((item) => item !== role))}
                >
                  {role} ×
                </button>
              ))}
            </div>
            <div className="settings-inline-input">
              <input
                value={newTitle}
                onChange={(event) => setNewTitle(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') addItem('target_roles', newTitle, setNewTitle)
                }}
                placeholder="Add a job title..."
              />
              <button type="button" onClick={() => addItem('target_roles', newTitle, setNewTitle)}>+</button>
            </div>
          </section>

          <section className="settings-card">
            <div className="settings-card-title">
              <span>⌖</span>
              <div>
                <h2>Preferred Locations</h2>
                <p>Set your location preferences for job matching</p>
              </div>
            </div>
            <div className="settings-chip-row">
              {(profile.preferred_locations || []).map((location) => (
                <button
                  key={location}
                  type="button"
                  className="settings-chip"
                  onClick={() => updateList('preferred_locations', profile.preferred_locations.filter((item) => item !== location))}
                >
                  {location} ×
                </button>
              ))}
            </div>
            <input
              className="settings-full-input"
              value={(profile.preferred_locations || []).join(', ')}
              onChange={(event) => updateList('preferred_locations', splitCsv(event.target.value))}
              placeholder="San Francisco, CA, New York, NY, Remote"
            />
          </section>

          <section className="settings-card">
            <div className="settings-card-title">
              <span>$</span>
              <div>
                <h2>Salary Range</h2>
                <p>Set your target compensation range</p>
              </div>
            </div>
            <div className="salary-row">
              <label>
                <span>Minimum</span>
                <input defaultValue="$140,000" />
              </label>
              <span>—</span>
              <label>
                <span>Maximum</span>
                <input value={profile.salary_expectations || '$220,000'} onChange={(event) => setProfile((current) => ({ ...current, salary_expectations: event.target.value }))} />
              </label>
            </div>
          </section>

          <section className="settings-card">
            <div className="settings-card-title">
              <div>
                <h2>Key Skills</h2>
                <p>Skills used for AI match scoring</p>
              </div>
            </div>
            <div className="settings-chip-row">
              {(profile.parsed_skills || []).map((skill) => (
                <button
                  key={skill}
                  type="button"
                  className="settings-chip purple"
                  onClick={() => updateList('parsed_skills', profile.parsed_skills.filter((item) => item !== skill))}
                >
                  {skill} ×
                </button>
              ))}
            </div>
            <div className="settings-inline-input">
              <input
                value={newSkill}
                onChange={(event) => setNewSkill(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') addItem('parsed_skills', newSkill, setNewSkill)
                }}
                placeholder="Add a skill..."
              />
              <button type="button" onClick={() => addItem('parsed_skills', newSkill, setNewSkill)}>+</button>
            </div>
          </section>

          <button type="button" className="settings-save" onClick={saveProfile} disabled={saving}>
            {saving ? 'Saving...' : 'Save changes'}
          </button>
        </div>
      )}

      {activeTab === 'profile' && (
        <section className="settings-card">
          <div className="settings-card-title">
            <div>
              <h2>Personal Information</h2>
              <p>Used for account personalization and resume tailoring.</p>
            </div>
          </div>
          <div className="profile-grid-simple">
            <label>
              <span>Full Name</span>
              <input value={profile.full_name || ''} onChange={(event) => setProfile((current) => ({ ...current, full_name: event.target.value }))} />
            </label>
            <label>
              <span>Email</span>
              <input value={onboarding?.user?.email || ''} readOnly />
            </label>
          </div>
          <button type="button" className="settings-save" onClick={saveProfile} disabled={saving}>
            {saving ? 'Saving...' : 'Save profile'}
          </button>
        </section>
      )}

      {activeTab === 'notifications' && (
        <section className="settings-card notification-card">
          {['New job matches', 'Application updates', 'Interview reminders', 'Weekly summary', 'AI recommendations'].map((title, index) => (
            <label key={title} className="notification-row">
              <span>
                <strong>{title}</strong>
                <small>{index === 0 ? 'Get notified when new jobs match your criteria' : 'Manage this notification preference'}</small>
              </span>
              <input type="checkbox" defaultChecked={index !== 3} />
            </label>
          ))}
        </section>
      )}

      {activeTab === 'resume' && (
        <section className="settings-card">
          <div className="settings-card-title">
            <div>
              <h2>Resume Management</h2>
              <p>Upload and manage your resume for AI tailoring</p>
            </div>
          </div>
          <textarea
            className="resume-editor"
            value={resumeText}
            onChange={(event) => setResumeText(event.target.value)}
            placeholder="Paste your resume here..."
          />
          <button type="button" className="settings-save" onClick={saveResume} disabled={saving}>
            {saving ? 'Saving...' : 'Save resume'}
          </button>
        </section>
      )}
    </section>
  )
}

export default ProfilePage
