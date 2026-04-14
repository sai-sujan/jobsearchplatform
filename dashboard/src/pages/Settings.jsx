import { useEffect, useState } from 'react'
import './Settings.css'
import { api } from '../lib/api'

const TABS = [
  { key: 'job_config', label: 'Search config', hint: 'Keywords, filters, and scrape limits.' },
  { key: 'env', label: 'Environment', hint: 'Keys, browser paths, and runtime configuration.' },
  { key: 'company_blacklist', label: 'Blacklist', hint: 'Companies and keywords to exclude.' },
  { key: 'your_skills', label: 'Skills', hint: 'Candidate skill inventory used during matching.' },
  { key: 'resume', label: 'Resume', hint: 'Plain-text master resume used for evaluation.' },
]

function Settings() {
  const [config, setConfig] = useState({
    env: '',
    job_config: {},
    company_blacklist: '',
    your_skills: '',
    resume: '',
  })
  const [editedConfig, setEditedConfig] = useState({})
  const [activeTab, setActiveTab] = useState('job_config')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    const fetchConfig = async () => {
      try {
        const response = await api.get('/api/config')
        setConfig(response.data)
        setEditedConfig(response.data)
        setError('')
      } catch {
        setError('Unable to load configuration. Make sure the API server is running.')
      } finally {
        setLoading(false)
      }
    }

    fetchConfig()
  }, [])

  const activeMeta = TABS.find((tab) => tab.key === activeTab)

  const handleTextChange = (configType, value) => {
    setEditedConfig((current) => ({ ...current, [configType]: value }))
  }

  const handleJsonChange = (value) => {
    try {
      setEditedConfig((current) => ({
        ...current,
        job_config: value ? JSON.parse(value) : {},
      }))
      setError('')
    } catch {
      // Keep editing fluid while typing invalid JSON.
    }
  }

  const saveConfig = async () => {
    try {
      setSaving(true)
      setError('')

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

          {activeTab === 'job_config' && (
            <textarea
              value={JSON.stringify(editedConfig.job_config || {}, null, 2)}
              onChange={(event) => handleJsonChange(event.target.value)}
              className="settings-editor"
              spellCheck={false}
            />
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
            <textarea
              value={editedConfig.resume || ''}
              onChange={(event) => handleTextChange('resume', event.target.value)}
              className="settings-editor settings-editor-resume"
              spellCheck={false}
            />
          )}

          <div className="settings-actions">
            <button className="primary-action" onClick={saveConfig} disabled={saving}>
              {saving ? 'Saving...' : 'Save changes'}
            </button>
            <button
              className="secondary-action"
              onClick={() => {
                setEditedConfig(config)
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

export default Settings
