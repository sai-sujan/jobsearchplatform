import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { api } from '../lib/api'
import './OpportunityInbox.css'

const TWELVE_HOURS_MS = 12 * 60 * 60 * 1000
const BUCKETS = ['Reply now', 'Deadline soon', 'Interview / schedule', 'Needs review', 'Safe to ignore']

const Icon = ({ name }) => {
  const common = { width: 20, height: 20, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true }
  if (name === 'mail') return <svg {...common}><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m3 7 9 6 9-6" /></svg>
  if (name === 'alert') return <svg {...common}><circle cx="12" cy="12" r="10" /><path d="M12 7v6" /><path d="M12 17h.01" /></svg>
  if (name === 'reply') return <svg {...common}><path d="M9 17 4 12l5-5" /><path d="M20 18v-2a4 4 0 0 0-4-4H4" /></svg>
  if (name === 'clock') return <svg {...common}><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>
  if (name === 'calendar') return <svg {...common}><rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4" /><path d="M8 2v4" /><path d="M3 10h18" /></svg>
  if (name === 'eye') return <svg {...common}><path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7-10-7-10-7Z" /><circle cx="12" cy="12" r="3" /></svg>
  if (name === 'shield') return <svg {...common}><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z" /><path d="m9 12 2 2 4-4" /></svg>
  if (name === 'sync') return <svg {...common}><path d="M21 12a9 9 0 0 1-15.5 6.2" /><path d="M3 12A9 9 0 0 1 18.5 5.8" /><path d="M18 2v4h-4" /><path d="M6 22v-4h4" /></svg>
  if (name === 'filter') return <svg {...common}><path d="M4 5h16" /><path d="M7 12h10" /><path d="M10 19h4" /></svg>
  if (name === 'chat') return <svg {...common}><path d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4Z" /><path d="M8 10h.01" /><path d="M12 10h.01" /><path d="M16 10h.01" /></svg>
  if (name === 'sparkles') return <svg {...common}><path d="m12 3 1.5 4.5L18 9l-4.5 1.5L12 15l-1.5-4.5L6 9l4.5-1.5L12 3Z" /><path d="M19 15h.01" /><path d="M5 19h.01" /></svg>
  if (name === 'check') return <svg {...common}><path d="m20 6-11 11-5-5" /></svg>
  if (name === 'more') return <svg {...common}><path d="M12 5h.01" /><path d="M12 12h.01" /><path d="M12 19h.01" /></svg>
  return <svg {...common}><circle cx="12" cy="12" r="10" /></svg>
}

const GoogleMark = () => (
  <svg className="oi-google-mark" viewBox="0 0 24 24" aria-hidden="true">
    <path fill="#4285F4" d="M23.5 12.3c0-.8-.1-1.5-.2-2.2H12v4.2h6.5c-.3 1.4-1.1 2.6-2.3 3.4v2.8h3.7c2.2-2 3.6-4.9 3.6-8.2Z" />
    <path fill="#34A853" d="M12 24c3.2 0 5.9-1.1 7.9-2.9l-3.7-2.8c-1 .7-2.4 1.1-4.2 1.1-3.1 0-5.7-2.1-6.6-4.9H1.6v2.9C3.6 21.3 7.5 24 12 24Z" />
    <path fill="#FBBC05" d="M5.4 14.5c-.2-.7-.4-1.5-.4-2.3s.1-1.6.4-2.3V7H1.6C.6 8.8 0 10.4 0 12.2s.6 3.4 1.6 5.2l3.8-2.9Z" />
    <path fill="#EA4335" d="M12 4.8c1.7 0 3.3.6 4.5 1.8L19.8 3C17.8 1.1 15.1 0 12 0 7.5 0 3.6 2.7 1.6 7l3.8 2.9C6.3 6.9 8.9 4.8 12 4.8Z" />
  </svg>
)

const formatTime = (value) => {
  if (!value) return 'Never'
  const date = new Date(value)
  const now = new Date()
  const diffHours = (now - date) / 3_600_000
  if (diffHours < 24) {
    return new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit' }).format(date)
  }
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(date)
}

const isImportant = (thread) => (
  thread.action_bucket === 'Reply now'
  || thread.action_bucket === 'Deadline soon'
  || thread.action_bucket === 'Interview / schedule'
  || (thread.action_bucket === 'Needs review' && ['positive_progress', 'needs_review'].includes(thread.ai_verdict))
)

const getActionText = (thread) => {
  if (!thread) return ''
  if (thread.action_bucket === 'Reply now') return 'Reply needed'
  if (thread.action_bucket === 'Deadline soon') return 'Complete before deadline'
  if (thread.action_bucket === 'Interview / schedule') return 'Schedule or prepare'
  return 'Review opportunity'
}

const getReadStateLabel = (thread) => (thread?.is_unread ? 'Unread' : 'Read')

const getBucketIcon = (bucket) => {
  if (bucket === 'Reply now') return 'reply'
  if (bucket === 'Deadline soon') return 'clock'
  if (bucket === 'Interview / schedule') return 'calendar'
  if (bucket === 'Needs review') return 'eye'
  return 'shield'
}

const getBucketTone = (bucket = '') => (
  bucket.toLowerCase().replace(/[^a-z]+/g, '-').replace(/^-|-$/g, '') || 'review'
)

const getWhyShown = (thread) => (
  (thread?.signals || [])
    .filter((signal) => !String(signal).startsWith('ai:'))
    .slice(0, 2)
    .join(' · ') || thread?.category || 'AI marked this as important'
)

const pickDefaultThread = (items = []) => (
  items.find(isImportant) || items.find((thread) => !thread.is_resolved) || null
)

const getInitials = (sender = '') => {
  const clean = sender.replace(/<.*?>/g, '').trim()
  if (!clean) return 'CO'
  return clean.split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toUpperCase()
}

const cleanEmailContext = (value = '') => {
  let text = String(value)
    .replace(/<https?:\/\/[^>]+>/gi, '')
    .replace(/https?:\/\/\S+/gi, '')
    .replace(/\*+/g, '')
    .replace(/[—–-]{5,}/g, ' ')
    .replace(/\belegible\b/gi, 'eligible')
    .replace(/\s+([,.?!:;])/g, '$1')
    .replace(/([.!?])([A-Z])/g, '$1 $2')
    .replace(/\s+/g, ' ')
    .trim()

  text = text
    .replace(/\b(thanks in advance for your response\.?\s*){2,}/gi, 'Thanks in advance for your response. ')
    .replace(/\b(kind regards\.?\s*){2,}/gi, 'Kind regards. ')
    .replace(/\b(thanks|regards|kind regards|best regards),?\s*(--)?\s*.*$/i, (match) => {
      const signoff = match.match(/\b(thanks|regards|kind regards|best regards)/i)?.[0]
      return signoff ? `${signoff}.` : ''
    })
    .replace(/\b(l|w|s):\s*$/gi, '')
    .replace(/\s+/g, ' ')
    .trim()

  return text || 'Open the email for the full thread context.'
}

const getContextBullets = (value = '') => {
  const cleaned = cleanEmailContext(value)
  const questionMatches = [...cleaned.matchAll(/([^?]+\?)/g)]
    .map((match) => match[1].trim())
    .map((question) => question.replace(/^.*?(?:quick question|regarding your profile|profile):\s*/i, '').trim())
    .filter((question) => question.length > 8)

  if (questionMatches.length >= 2) {
    const intro = cleaned.split(questionMatches[0])[0]
      .replace(/:\s*$/g, '')
      .trim()
    return {
      intro: intro || 'The sender is asking for the following information:',
      bullets: [...new Set(questionMatches)].slice(0, 6),
    }
  }

  return {
    intro: cleaned,
    bullets: [],
  }
}

const getStructuredSummary = (thread) => {
  if (!thread) return []
  const whatHappened = thread.one_line_summary || thread.subject || 'CareerOS found a possible opportunity email.'
  const whyItMatters = getWhyShown(thread)
  const nextAction = getActionText(thread)
  const context = getContextBullets(thread.snippet || thread.subject)
  return [
    { label: 'What happened', value: whatHappened },
    { label: 'Why it matters', value: whyItMatters },
    { label: 'Next action', value: nextAction },
    { label: 'Email context', value: context, kind: 'context' },
  ]
}

function OpportunityInbox() {
  const [threads, setThreads] = useState([])
  const [stats, setStats] = useState({})
  const [connection, setConnection] = useState({})
  const [selectedThread, setSelectedThread] = useState(null)
  const [activeBucket, setActiveBucket] = useState('Reply now')
  const [loading, setLoading] = useState(true)
  const [checking, setChecking] = useState(false)
  const [message, setMessage] = useState('')
  const [messageType, setMessageType] = useState('info')
  const lightSyncedRef = useRef(false)
  const isInitialLoading = loading && threads.length === 0
  const isBusy = loading || checking

  const importantThreads = useMemo(
    () => threads.filter(isImportant).slice(0, 10),
    [threads],
  )

  const bucketCounts = useMemo(() => BUCKETS.reduce((acc, bucket) => {
    acc[bucket] = threads.filter((thread) => thread.action_bucket === bucket && !thread.is_resolved).length
    return acc
  }, {}), [threads])

  const visibleThreads = useMemo(() => {
    const base = activeBucket === 'All'
      ? importantThreads
      : threads.filter((thread) => thread.action_bucket === activeBucket && !thread.is_resolved)
    return base.slice(0, 10)
  }, [activeBucket, importantThreads, threads])

  const showMessage = (text, type = 'info') => {
    setMessage(text)
    setMessageType(type)
  }

  const loadInbox = useCallback(async ({ preserveMessage = false } = {}) => {
    setLoading(true)
    try {
      const response = await api.get('/api/opportunities')
      const nextThreads = response.data.threads || []
      setThreads(nextThreads)
      setStats(response.data.stats || {})
      setConnection(response.data.connection || {})
      setSelectedThread((current) => {
        if (!current) return pickDefaultThread(nextThreads)
        return nextThreads.find((thread) => thread.id === current.id) || pickDefaultThread(nextThreads)
      })
      if (!preserveMessage) setMessage('')
    } catch (error) {
      showMessage(error.response?.data?.detail || 'Could not load Opportunity Inbox.', 'error')
    } finally {
      setLoading(false)
    }
  }, [])

  const runSync = useCallback(async ({ mode = 'full', silent = false } = {}) => {
    if (!silent) {
      setChecking(true)
      setMessage('')
    }

    try {
      const response = await api.post('/api/opportunities/sync', null, { params: { mode } })
      const nextThreads = response.data.threads || []
      const importantCount = nextThreads.filter(isImportant).length

      setThreads(nextThreads)
      setStats(response.data.stats || {})
      if (!silent) {
        showMessage(
          `Checked ${response.data.scanned || 0} emails · ${response.data.new || 0} new · ${importantCount} important · ${response.data.ai_triaged || 0} AI review`,
          'info',
        )
      }
    } catch (error) {
      if (!silent) {
        showMessage(error.response?.data?.detail || 'Check failed. Connect Gmail and try again.', 'error')
      }
    } finally {
      if (!silent) setChecking(false)
      loadInbox({ preserveMessage: !silent })
    }
  }, [loadInbox])

  useEffect(() => {
    loadInbox()
  }, [loadInbox])

  useEffect(() => {
    if (!connection.connected || lightSyncedRef.current) return
    lightSyncedRef.current = true
    runSync({ mode: 'light', silent: true })
  }, [connection.connected, runSync])

  useEffect(() => {
    if (!connection.connected) return undefined
    const interval = setInterval(() => {
      runSync({ mode: 'full', silent: true })
    }, TWELVE_HOURS_MS)
    return () => clearInterval(interval)
  }, [connection.connected, runSync])

  useEffect(() => {
    if (!selectedThread && visibleThreads.length > 0) {
      setSelectedThread(visibleThreads[0])
    }
  }, [selectedThread, visibleThreads])

  const handleConnect = async () => {
    try {
      const response = await api.get('/api/opportunities/gmail/auth-url')
      if (response.data.auth_url) {
        window.location.href = response.data.auth_url
      } else {
        showMessage(response.data.detail || 'Gmail OAuth is not configured yet.', 'error')
      }
    } catch (error) {
      showMessage(error.response?.data?.detail || 'Could not start Gmail connection.', 'error')
    }
  }

  const handleDone = async (thread) => {
    try {
      const response = await api.patch(`/api/opportunities/${thread.id}/state`, { is_resolved: true })
      setThreads((current) => current.filter((item) => item.id !== response.data.id))
      setSelectedThread(null)
    } catch {
      showMessage('Could not mark this done. Try again.', 'error')
    }
  }

  const applyThreadUpdate = (updated, previous = null) => {
    setThreads((current) => current.map((item) => (item.id === updated.id ? updated : item)))
    setSelectedThread((current) => (current?.id === updated.id ? updated : current))
    if (previous && previous.is_unread !== updated.is_unread) {
      const delta = updated.is_unread ? 1 : -1
      setStats((current) => ({
        ...current,
        unread: Math.max(0, (current.unread ?? 0) + delta),
      }))
    }
  }

  const updateReadState = async (thread, isUnread) => {
    try {
      const response = await api.patch(`/api/opportunities/${thread.id}/state`, { is_unread: isUnread })
      applyThreadUpdate(response.data, thread)
      showMessage(isUnread ? 'Marked as unread.' : 'Marked as read.', 'info')
    } catch {
      showMessage(`Could not mark this ${isUnread ? 'unread' : 'read'}. Try again.`, 'error')
    }
  }

  const draftReply = async (thread) => {
    try {
      const response = await api.post(`/api/opportunities/${thread.id}/draft-reply`)
      const updated = response.data
      setThreads((current) => current.map((item) => (item.id === updated.id ? updated : item)))
      setSelectedThread(updated)
    } catch {
      showMessage('Could not draft reply. Try again.', 'error')
    }
  }

  const openGmail = (thread) => {
    api.post(`/api/opportunities/${thread.id}/opened`)
      .then((response) => applyThreadUpdate(response.data, thread))
      .catch(() => {})
    if (thread.gmail_url) {
      window.open(thread.gmail_url, '_blank', 'noopener,noreferrer')
      return
    }
    const query = encodeURIComponent(thread.subject || thread.sender || '')
    window.open(`https://mail.google.com/mail/u/0/#search/${query}`, '_blank', 'noopener,noreferrer')
  }

  return (
    <section className={`opportunity-inbox${isBusy ? ' is-busy' : ''}`}>
      <header className="oi-header">
        <div>
          <p className="oi-kicker">Opportunity Inbox</p>
          <h1>Action-worthy email, without the noise.</h1>
          <p className="oi-header-desc">We analyze your emails and show only the ones that need your attention.</p>
        </div>
        <div className="oi-header-actions">
          <button type="button" className="oi-btn oi-btn-secondary" onClick={handleConnect}>
            <GoogleMark />
            {connection.connected ? 'Gmail connected' : 'Connect Gmail'}
          </button>
          <button type="button" className="oi-btn oi-btn-primary" onClick={() => runSync({ mode: 'full', silent: false })} disabled={checking}>
            <Icon name="sync" />
            {checking ? 'Syncing...' : 'Sync inbox'}
          </button>
        </div>
      </header>

      <div className="oi-stats" aria-label="Opportunity inbox stats">
        {isInitialLoading ? (
          [0, 1, 2, 3].map((item) => (
            <div className="oi-stat-card oi-stat-skeleton" key={item}>
              <span className="oi-skel-circle" />
              <span className="oi-stat-copy">
                <span className="oi-skel-line short" />
                <strong className="oi-skel-line number" />
                <em className="oi-skel-line tiny" />
              </span>
            </div>
          ))
        ) : (
          <>
            <div className="oi-stat-card">
              <span className="oi-stat-icon blue"><Icon name="mail" /></span>
              <span className="oi-stat-copy"><span>Open</span><strong>{stats.total_open || threads.length || 0}</strong><em>Emails</em></span>
            </div>
            <div className="oi-stat-card">
              <span className="oi-stat-icon red"><Icon name="alert" /></span>
              <span className="oi-stat-copy"><span>Urgent</span><strong>{stats.urgent || 0}</strong><em>Emails</em></span>
            </div>
            <div className="oi-stat-card">
              <span className="oi-stat-icon purple"><Icon name="mail" /></span>
              <span className="oi-stat-copy"><span>Unread</span><strong>{stats.unread || 0}</strong><em>Emails</em></span>
            </div>
            <div className="oi-stat-card">
              <span className="oi-stat-icon green"><Icon name="reply" /></span>
              <span className="oi-stat-copy"><span>Reply now</span><strong>{stats.reply_now || bucketCounts['Reply now'] || 0}</strong><em>Emails</em></span>
            </div>
          </>
        )}
      </div>

      <div className="oi-filter-row" aria-label="Opportunity email filters">
        {isInitialLoading ? (
          <>
            {[0, 1, 2, 3, 4].map((item) => <span className="oi-filter-chip oi-filter-skeleton" key={item} />)}
            <span className="oi-filter-chip oi-filter-control oi-filter-skeleton" />
          </>
        ) : (
          <>
            {BUCKETS.map((bucket) => (
              <button key={bucket} type="button" className={`oi-filter-chip${activeBucket === bucket ? ' active' : ''}`} onClick={() => setActiveBucket(bucket)}>
                <Icon name={getBucketIcon(bucket)} />
                <span>{bucket}</span>
                <span className="oi-filter-badge">{bucketCounts[bucket] || 0}</span>
              </button>
            ))}
            <button type="button" className="oi-filter-chip oi-filter-control" onClick={() => setActiveBucket('All')}>
              <Icon name="filter" />
              <span>Filters</span>
            </button>
          </>
        )}
      </div>

      {message && (
        <div className={`oi-message${messageType === 'error' ? ' error' : ''}`}>
          {message}
        </div>
      )}

      <div className="oi-workspace">
        <div className="oi-thread-list">
          <div className="oi-list-head">
            <strong>Top actions</strong>
            <span className="oi-list-head-count">{loading ? 'Loading...' : `${visibleThreads.length} emails`}</span>
          </div>

          <div className="oi-thread-scroll">
            {loading ? (
              <div className="oi-loading">
                {[0, 1, 2].map((item) => <div key={item} className="oi-skeleton-row" />)}
              </div>
            ) : visibleThreads.length === 0 ? (
              <div className="oi-empty">
                <div className="oi-empty-art" aria-hidden="true">
                  <Icon name="mail" />
                  <span />
                </div>
                <strong>No urgent opportunity emails yet</strong>
                <span>Connect Gmail or sync your inbox to see classifier results.</span>
                {!connection.connected && (
                  <button type="button" className="oi-btn oi-btn-primary" onClick={handleConnect}>
                    <GoogleMark />
                    Connect Gmail
                  </button>
                )}
              </div>
            ) : (
              <>
                {visibleThreads.map((thread) => (
                  <button
                    key={thread.id}
                    type="button"
                    className={`oi-thread${selectedThread?.id === thread.id ? ' selected' : ''}${thread.is_unread ? ' unread' : ' read'}`}
                    onClick={() => setSelectedThread(thread)}
                  >
                    <span className={`oi-action-chip ${getBucketTone(thread.action_bucket)}`}>{getActionText(thread)}</span>
                    <span className="oi-thread-main">
                      <span className="oi-thread-top">
                        <span className="oi-thread-subject">{thread.one_line_summary || thread.subject}</span>
                        <time className="oi-thread-time">{formatTime(thread.received_at)}</time>
                      </span>
                      <span className="oi-thread-summary">{thread.sender || thread.subject}</span>
                      <span className="oi-thread-tags">
                        <span className={`oi-thread-tag oi-read-state-tag${thread.is_unread ? ' unread' : ' read'}`}>{getReadStateLabel(thread)}</span>
                        <span className="oi-thread-tag">Why: {getWhyShown(thread)}</span>
                      </span>
                    </span>
                    <span className={`oi-selected-dot${thread.is_unread ? ' unread' : ''}`} aria-hidden="true" />
                  </button>
                ))}
                <div className="oi-caught-up">
                  <strong>That's it! You're all caught up.</strong>
                  <span>We'll notify you when new action-worthy emails arrive.</span>
                </div>
              </>
            )}
          </div>
        </div>

        <aside className="oi-detail">
          {selectedThread ? (
            <div className="oi-detail-inner">
              <div className="oi-detail-scroll">
                <div className="oi-detail-toolbar">
                  <span className={`oi-action-chip ${getBucketTone(selectedThread.action_bucket)}`}>{getActionText(selectedThread)}</span>
                  <div className="oi-detail-toolbar-actions">
                    <button type="button" className="oi-mini-btn" onClick={() => openGmail(selectedThread)}><Icon name="mail" /> Open in Gmail</button>
                    <button type="button" className="oi-mini-btn" onClick={() => updateReadState(selectedThread, !selectedThread.is_unread)}>
                      <Icon name="eye" /> {selectedThread.is_unread ? 'Mark as read' : 'Mark as unread'}
                    </button>
                    <button type="button" className="oi-mini-btn" onClick={() => handleDone(selectedThread)}><Icon name="check" /> Mark done</button>
                  </div>
                </div>

                <div className="oi-detail-head">
                  <h2>{selectedThread.one_line_summary || selectedThread.subject}</h2>
                  <div className="oi-detail-meta">
                    <span className="oi-avatar">{getInitials(selectedThread.sender)}</span>
                    <strong>{selectedThread.sender?.split('<')[0]?.trim() || 'Opportunity contact'}</strong>
                    <span>{selectedThread.sender?.match(/<(.+)>/)?.[1] || selectedThread.sender_domain}</span>
                    <time>{formatTime(selectedThread.received_at)}</time>
                  </div>
                  <div className="oi-detail-read-state">
                    <span className={`oi-thread-tag oi-read-state-tag${selectedThread.is_unread ? ' unread' : ' read'}`}>{getReadStateLabel(selectedThread)}</span>
                  </div>
                </div>

                <div className="oi-decision-grid">
                  <div className="oi-detail-section">
                    <span>What to do</span>
                    <strong>{getActionText(selectedThread)}</strong>
                  </div>

                  <div className="oi-detail-section">
                    <span>Why shown</span>
                    <strong>{getWhyShown(selectedThread)}</strong>
                  </div>
                </div>

                <div className="oi-snippet">
                  <span>Email summary</span>
                  <div className="oi-summary-list">
                    {getStructuredSummary(selectedThread).map((item) => (
                      <div className="oi-summary-item" key={item.label}>
                        <strong>{item.label}</strong>
                        {item.kind === 'context' ? (
                          <div className="oi-context-copy">
                            <p>{item.value.intro}</p>
                            {item.value.bullets.length > 0 && (
                              <ul>
                                {item.value.bullets.map((bullet) => <li key={bullet}>{bullet}</li>)}
                              </ul>
                            )}
                          </div>
                        ) : (
                          <p>{item.value}</p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                {selectedThread.draft_reply && (
                  <pre className="oi-draft">{selectedThread.draft_reply}</pre>
                )}
              </div>

              <div className="oi-detail-actions">
                <button type="button" className="oi-btn oi-btn-primary" onClick={() => draftReply(selectedThread)}>
                  <Icon name="sparkles" />
                  Draft reply with AI
                </button>
                <button type="button" className="oi-btn oi-btn-secondary" onClick={() => showMessage('Snooze is coming next.', 'info')}>
                  <Icon name="clock" />
                  Snooze
                </button>
                <button type="button" className="oi-btn oi-btn-secondary" onClick={() => handleDone(selectedThread)}>
                  <Icon name="shield" />
                  Mark safe
                </button>
              </div>
            </div>
          ) : loading ? (
            <div className="oi-detail-skeleton">
              <div className="oi-detail-skeleton-top">
                <span className="oi-skel-pill" />
                <span className="oi-skel-actions" />
              </div>
              <span className="oi-skel-line title" />
              <span className="oi-skel-line title second" />
              <div className="oi-skel-meta">
                <span className="oi-skel-circle small" />
                <span className="oi-skel-line medium" />
                <span className="oi-skel-line short" />
              </div>
              <div className="oi-skel-grid">
                <span />
                <span />
              </div>
              <div className="oi-skel-summary">
                <span />
                <span />
                <span />
                <span />
              </div>
              <div className="oi-skel-cta-row">
                <span />
                <span />
                <span />
              </div>
            </div>
          ) : (
            <div className="oi-detail-empty">
              <span className="oi-detail-empty-icon"><Icon name="chat" /></span>
              <strong>Select a thread</strong>
              <span>Review why it was surfaced, draft a response, or mark it resolved.</span>
            </div>
          )}
        </aside>
      </div>
    </section>
  )
}

export default OpportunityInbox
