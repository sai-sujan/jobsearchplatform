import { useState } from 'react'
import { api, storeToken } from '../lib/api'
import './AuthPage.css'

const INITIAL_FORM = {
  full_name: '',
  username: '',
  password: '',
}

function AuthPage({ onAuthenticated }) {
  const [mode, setMode] = useState('login')
  const [form, setForm] = useState(INITIAL_FORM)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  const submit = async (event) => {
    event.preventDefault()
    setSubmitting(true)
    setError('')
    try {
      const endpoint = mode === 'signup' ? '/api/v1/auth/signup' : '/api/v1/auth/login'
      const payload =
        mode === 'signup'
          ? form
          : { username: form.username, password: form.password }
      const response = await api.post(endpoint, payload)
      storeToken(response.data.token || '')
      onAuthenticated(response.data.user)
    } catch (requestError) {
      setError(requestError.response?.data?.detail || 'Unable to continue right now.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <section className="auth-shell">
      <div className="auth-stage">
        <div className="auth-form-panel">
          <div className="auth-brand">
            <span className="auth-brand-mark">
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M6.5 7.5h11A2.5 2.5 0 0 1 20 10v7.5A2.5 2.5 0 0 1 17.5 20h-11A2.5 2.5 0 0 1 4 17.5V10a2.5 2.5 0 0 1 2.5-2.5Z" />
                <path d="M9 7.5V5.8A1.8 1.8 0 0 1 10.8 4h2.4A1.8 1.8 0 0 1 15 5.8v1.7" />
                <path d="M9 13.5h6" />
              </svg>
            </span>
            <strong>CareerOS</strong>
          </div>

          <div className="auth-toggle">
            <button
              type="button"
              className={mode === 'login' ? 'active' : ''}
              onClick={() => setMode('login')}
            >
              Log in
            </button>
            <button
              type="button"
              className={mode === 'signup' ? 'active' : ''}
              onClick={() => setMode('signup')}
            >
              Create account
            </button>
          </div>

          <div className="auth-title-block">
            <span className="auth-icon-tile">
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M6.5 7.5h11A2.5 2.5 0 0 1 20 10v7.5A2.5 2.5 0 0 1 17.5 20h-11A2.5 2.5 0 0 1 4 17.5V10a2.5 2.5 0 0 1 2.5-2.5Z" />
                <path d="M9 7.5V5.8A1.8 1.8 0 0 1 10.8 4h2.4A1.8 1.8 0 0 1 15 5.8v1.7" />
              </svg>
            </span>
            <h1>{mode === 'signup' ? 'Create your workspace' : 'Welcome back'}</h1>
            <p>
              {mode === 'signup'
                ? 'Start with your resume, then we will shape the job feed around your profile.'
                : 'Log in to review matched jobs, track applications, and tailor resumes.'}
            </p>
          </div>

          <form className="auth-form" onSubmit={submit}>
            {mode === 'signup' && (
              <label>
                <span>Full name</span>
                <input
                  value={form.full_name}
                  onChange={(event) => setForm((current) => ({ ...current, full_name: event.target.value }))}
                  placeholder="Your name"
                />
              </label>
            )}

            <label>
              <span>Username</span>
              <input
                value={form.username}
                onChange={(event) => setForm((current) => ({ ...current, username: event.target.value }))}
                placeholder="Choose a username"
                autoComplete="username"
              />
            </label>

            <label>
              <span>Password</span>
              <input
                type="password"
                value={form.password}
                onChange={(event) => setForm((current) => ({ ...current, password: event.target.value }))}
                placeholder="At least 8 characters"
                autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
              />
            </label>

            {error && <div className="auth-error">{error}</div>}

            <button className="primary-action auth-submit" type="submit" disabled={submitting}>
              {submitting ? 'Working...' : mode === 'signup' ? 'Start setup' : 'Continue'}
            </button>
          </form>

          <div className="auth-social-row" aria-label="Future sign-in providers">
            <button type="button">Google</button>
            <button type="button">LinkedIn</button>
          </div>
        </div>

        <aside className="auth-showcase" aria-label="CareerOS product preview">
          <div className="auth-showcase-card">
            <div className="auth-figure">
              <span className="auth-figure-head" />
              <span className="auth-figure-body" />
              <span className="auth-figure-laptop" />
            </div>
            <div className="auth-mini-window auth-mini-window-one">
              <strong>95%</strong>
              <span>Top match</span>
            </div>
            <div className="auth-mini-window auth-mini-window-two">
              <strong>3</strong>
              <span>interviews</span>
            </div>
          </div>
          <div className="auth-showcase-copy">
            <h2>Accelerate your career</h2>
            <p>Matched roles, application tracking, and AI resume tailoring in one calm workspace.</p>
            <div className="auth-showcase-dots" aria-hidden="true">
              <span />
              <span className="active" />
              <span />
            </div>
          </div>
        </aside>
      </div>
    </section>
  )
}

export default AuthPage
