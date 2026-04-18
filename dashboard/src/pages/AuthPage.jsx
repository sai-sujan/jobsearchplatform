import { useState } from 'react'
import { api, storeToken } from '../lib/api'
import './AuthPage.css'

const INITIAL_FORM = {
  full_name: '',
  username: '',
  password: '',
  remember: true,
}

function AuthPage({ onAuthenticated }) {
  const [mode, setMode] = useState('login')
  const [form, setForm] = useState(INITIAL_FORM)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [showPassword, setShowPassword] = useState(false)

  const submit = async (event) => {
    event.preventDefault()
    setSubmitting(true)
    setError('')
    try {
      const endpoint = mode === 'signup' ? '/api/v1/auth/signup' : '/api/v1/auth/login'
      const payload =
        mode === 'signup'
          ? { full_name: form.full_name, username: form.username, password: form.password }
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

  const isLogin = mode === 'login'

  return (
    <section className="auth-shell">
      <div className="auth-stage">
        <div className="auth-form-panel">
          <header className="auth-brand">
            <span className="auth-brand-mark" aria-hidden="true">
              <svg viewBox="0 0 24 24">
                <rect x="3" y="7" width="18" height="13" rx="2.2" />
                <path d="M8 7V5.5A1.5 1.5 0 0 1 9.5 4h5A1.5 1.5 0 0 1 16 5.5V7" />
                <path d="M3 12h18" />
              </svg>
            </span>
            <strong>CareerOS</strong>
          </header>

          <nav className="auth-tabs" aria-label="Auth mode">
            <button
              type="button"
              className={isLogin ? 'active' : ''}
              onClick={() => setMode('login')}
            >
              Log In
            </button>
            <button
              type="button"
              className={!isLogin ? 'active' : ''}
              onClick={() => setMode('signup')}
            >
              Sign Up
            </button>
          </nav>

          <div className="auth-hero">
            <span className="auth-hero-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24">
                <circle cx="9" cy="9" r="3" />
                <circle cx="17" cy="10" r="2.4" />
                <path d="M3 19c.7-3 3.2-4.5 6-4.5s5.3 1.5 6 4.5" />
                <path d="M14.5 17.5c.6-2 2.3-3 4.5-3 1.5 0 2.7.5 3.5 1.5" />
              </svg>
            </span>
            <h1>{isLogin ? 'Welcome Back' : 'Create Account'}</h1>
            <p>
              {isLogin
                ? 'Please enter your details to access your account.'
                : 'Start with your resume—we shape the job feed around you.'}
            </p>
          </div>

          <form className="auth-form" onSubmit={submit}>
            {!isLogin && (
              <label className="auth-field">
                <span className="auth-field-label">Full Name<em>*</em></span>
                <input
                  className="auth-input"
                  value={form.full_name}
                  onChange={(e) => setForm((c) => ({ ...c, full_name: e.target.value }))}
                  placeholder="Your name"
                />
              </label>
            )}

            <label className="auth-field">
              <span className="auth-field-label">Email Address<em>*</em></span>
              <input
                className="auth-input"
                value={form.username}
                onChange={(e) => setForm((c) => ({ ...c, username: e.target.value }))}
                placeholder="Enter your email"
                autoComplete="username"
              />
            </label>

            <label className="auth-field">
              <span className="auth-field-label">Password<em>*</em></span>
              <div className="auth-input-wrap">
                <input
                  className="auth-input"
                  type={showPassword ? 'text' : 'password'}
                  value={form.password}
                  onChange={(e) => setForm((c) => ({ ...c, password: e.target.value }))}
                  placeholder="••••••••••"
                  autoComplete={isLogin ? 'current-password' : 'new-password'}
                />
                <button
                  type="button"
                  className="auth-eye"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    {showPassword ? (
                      <>
                        <path d="M3 3l18 18" />
                        <path d="M10.5 10.7a2 2 0 0 0 2.8 2.8" />
                        <path d="M9.5 5.3A9.8 9.8 0 0 1 12 5c5 0 9 4 10 7-.4 1.2-1.2 2.5-2.3 3.6" />
                        <path d="M6.3 6.6C4 8.2 2.5 10.5 2 12c1 3 5 7 10 7 1.6 0 3-.3 4.3-.8" />
                      </>
                    ) : (
                      <>
                        <path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z" />
                        <circle cx="12" cy="12" r="3" />
                      </>
                    )}
                  </svg>
                </button>
              </div>
            </label>

            <div className="auth-row">
              <label className="auth-check">
                <input
                  type="checkbox"
                  checked={form.remember}
                  onChange={(e) => setForm((c) => ({ ...c, remember: e.target.checked }))}
                />
                <span>Remember me</span>
              </label>
              <button type="button" className="auth-link">Forgot password?</button>
            </div>

            {error && <div className="auth-error">{error}</div>}

            <button className="auth-submit" type="submit" disabled={submitting}>
              {submitting ? 'Working…' : isLogin ? 'Log In' : 'Create Account'}
            </button>
          </form>

          <div className="auth-divider"><span>OR CONTINUE WITH</span></div>

          <div className="auth-socials">
            <button type="button" className="auth-social">
              <svg viewBox="0 0 24 24" aria-hidden="true" className="auth-social-icon">
                <path fill="#4285F4" d="M23 12.2c0-.8-.1-1.6-.2-2.3H12v4.4h6.2c-.3 1.5-1.1 2.7-2.4 3.5v2.9h3.8c2.2-2 3.4-5 3.4-8.5z"/>
                <path fill="#34A853" d="M12 23c3.2 0 5.9-1.1 7.9-2.9l-3.8-2.9c-1.1.7-2.5 1.1-4.1 1.1-3.1 0-5.8-2.1-6.7-5H1.3v3.1C3.3 20.4 7.3 23 12 23z"/>
                <path fill="#FBBC05" d="M5.3 13.3a6.6 6.6 0 0 1 0-4.3V5.9H1.3a11 11 0 0 0 0 9.9l4-2.5z"/>
                <path fill="#EA4335" d="M12 5.6c1.8 0 3.3.6 4.5 1.8l3.4-3.4C17.9 2 15.2 1 12 1 7.3 1 3.3 3.6 1.3 7.4l4 3.1c.9-2.9 3.6-4.9 6.7-4.9z"/>
              </svg>
              <span>Sign up with Google</span>
            </button>
            <button type="button" className="auth-social">
              <svg viewBox="0 0 24 24" aria-hidden="true" className="auth-social-icon">
                <path fill="#1877F2" d="M22 12a10 10 0 1 0-11.6 9.9v-7H7.9V12h2.5V9.8c0-2.5 1.5-3.9 3.8-3.9 1.1 0 2.2.2 2.2.2v2.5h-1.3c-1.2 0-1.6.8-1.6 1.6V12h2.8l-.4 2.9h-2.3v7A10 10 0 0 0 22 12z"/>
              </svg>
              <span>Sign up with Facebook</span>
            </button>
          </div>
        </div>

        <aside className="auth-showcase" aria-label="CareerOS preview">
          <div className="auth-showcase-card">
            <div className="auth-figure" aria-hidden="true">
              <span className="auth-figure-head" />
              <span className="auth-figure-glasses" />
              <span className="auth-figure-body" />
              <span className="auth-figure-laptop" />
              <span className="auth-figure-arm" />
            </div>
            <span className="auth-blob auth-blob-a" aria-hidden="true" />
            <span className="auth-blob auth-blob-b" aria-hidden="true" />
          </div>
          <div className="auth-showcase-copy">
            <h2>Accelerate Your Career</h2>
            <p>AI-powered resume tailoring, intelligent job tracking, and professional growth tools—all in one platform.</p>
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
