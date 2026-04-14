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
      <div className="auth-panel">
        <div className="auth-copy">
          <span className="eyebrow">Personalized job search</span>
          <h1>See only the jobs you should actually apply to.</h1>
          <p>
            Create your account, tell the app what roles fit you, and we&apos;ll tailor the
            workspace around your profile instead of exposing raw scraping noise.
          </p>
        </div>

        <form className="auth-form" onSubmit={submit}>
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
            {submitting ? 'Working...' : mode === 'signup' ? 'Start onboarding' : 'Continue'}
          </button>
        </form>
      </div>
    </section>
  )
}

export default AuthPage
