import { useEffect, useState } from 'react'
import { api } from '../lib/api'
import './KeywordBank.css'

function BubbleCloud({ keywords }) {
  if (!keywords.length) return null
  const max = keywords[0].count
  const min = keywords[keywords.length - 1].count

  return (
    <div className="bubble-cloud">
      {keywords.slice(0, 60).map(({ keyword, count }) => {
        const ratio = max === min ? 1 : (count - min) / (max - min)
        const size = Math.round(56 + ratio * 72)
        const fontSize = Math.round(10 + ratio * 7)
        const tier = count >= 4 ? 'hot' : count >= 2 ? 'warm' : 'cool'
        return (
          <CopyBubble key={keyword} keyword={keyword} count={count} size={size} fontSize={fontSize} tier={tier} />
        )
      })}
    </div>
  )
}

function CopyBubble({ keyword, count, size, fontSize, tier }) {
  const [copied, setCopied] = useState(false)
  function handleCopy() {
    navigator.clipboard.writeText(keyword).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    })
  }
  return (
    <button
      type="button"
      className={`bubble bubble--${tier}${copied ? ' bubble--copied' : ''}`}
      style={{ width: size, height: size, fontSize }}
      onClick={handleCopy}
      title={`${count} job${count !== 1 ? 's' : ''} — click to copy`}
    >
      <span className="bubble-word">{copied ? '✓' : keyword}</span>
      <span className="bubble-count">{count}</span>
    </button>
  )
}

function KeywordChip({ keyword, jobs }) {
  const [copied, setCopied] = useState(false)
  const [expanded, setExpanded] = useState(false)
  function handleCopy(e) {
    e.stopPropagation()
    navigator.clipboard.writeText(keyword).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    })
  }
  return (
    <div className="kw-chip-wrap">
      <button
        type="button"
        className={`kw-chip${copied ? ' kw-chip--copied' : ''}`}
        onClick={handleCopy}
        onMouseEnter={() => setExpanded(true)}
        onMouseLeave={() => setExpanded(false)}
      >
        <span>{copied ? '✓ copied' : keyword}</span>
        <span className="kw-copy-icon">
          {copied
            ? <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12" /></svg>
            : <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></svg>
          }
        </span>
      </button>
      {expanded && jobs && jobs.length > 0 && (
        <div className="kw-jobs-tooltip">
          {jobs.slice(0, 6).map((j) => (
            <span key={j.id} className="kw-job-name">{j.company ? `${j.company} — ${j.title}` : j.title}</span>
          ))}
          {jobs.length > 6 && <span className="kw-job-name kw-job-more">+{jobs.length - 6} more</span>}
        </div>
      )}
    </div>
  )
}

function KeywordSection({ title, subtitle, keywords, accent }) {
  if (!keywords.length) return null
  return (
    <section className={`kb-section kb-section--${accent}`}>
      <div className="kb-section-header">
        <div>
          <p className="section-kicker">{subtitle}</p>
          <h3>{title}</h3>
        </div>
        <span className="kb-count">{keywords.length}</span>
      </div>
      <div className="kw-chip-grid">
        {keywords.map(({ keyword, jobs }) => (
          <KeywordChip key={keyword} keyword={keyword} jobs={jobs} />
        ))}
      </div>
    </section>
  )
}

// ── Trends view ──────────────────────────────────────────────────────────────

function DeltaBadge({ delta, isNew }) {
  if (isNew) return <span className="trend-badge trend-badge--new">NEW</span>
  if (delta === 0) return <span className="trend-badge trend-badge--flat">—</span>
  const up = delta > 0
  return (
    <span className={`trend-badge trend-badge--${up ? 'up' : 'down'}`}>
      {up ? '▲' : '▼'} {Math.abs(delta)}
    </span>
  )
}

function TrendRow({ rank, keyword, count, delta, isNew }) {
  const [copied, setCopied] = useState(false)
  function handleCopy() {
    navigator.clipboard.writeText(keyword).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1200)
    })
  }
  return (
    <div className={`trend-row${isNew ? ' trend-row--new' : ''}`} onClick={handleCopy} title="Click to copy">
      <span className="trend-rank">#{rank}</span>
      <span className="trend-keyword">{copied ? '✓ copied' : keyword}</span>
      <span className="trend-count">{count} jobs</span>
      <DeltaBadge delta={delta} isNew={isNew} />
    </div>
  )
}

function TrendsPane({ trendData, trendLoading, trendError, granularity, setGranularity }) {
  const [selectedIdx, setSelectedIdx] = useState(0)

  // reset selection when data changes
  useEffect(() => { setSelectedIdx(0) }, [trendData])

  if (trendLoading) return <div className="kb-loading">Loading trends...</div>
  if (trendError) return <div className="kb-loading kb-error">{trendError}</div>
  if (!trendData || !trendData.periods.length) {
    return <div className="kb-empty"><p>No trend data yet. Jobs need delivered_at timestamps.</p></div>
  }

  const periods = trendData.periods
  const current = periods[selectedIdx]
  const prev = periods[selectedIdx + 1]

  // build prev keyword map for delta computation
  const prevMap = {}
  if (prev) {
    for (const { keyword, count } of prev.keywords) {
      prevMap[keyword] = count
    }
  }

  return (
    <div className="trends-pane">
      {/* granularity selector */}
      <div className="trends-top">
        <div className="kb-view-toggle">
          {['day', 'week', 'month'].map((g) => (
            <button
              key={g}
              type="button"
              className={`kb-toggle-btn${granularity === g ? ' active' : ''}`}
              onClick={() => setGranularity(g)}
            >
              {g.charAt(0).toUpperCase() + g.slice(1)}
            </button>
          ))}
        </div>
        {prev && (
          <span className="trends-vs-label">
            Comparing <strong>{current.label}</strong> vs <strong>{prev.label}</strong>
          </span>
        )}
        {!prev && (
          <span className="trends-vs-label">
            <strong>{current.label}</strong> — no previous period to compare
          </span>
        )}
      </div>

      {/* period tabs */}
      <div className="trends-period-tabs">
        {periods.map((p, i) => (
          <button
            key={p.key}
            type="button"
            className={`trends-tab${i === selectedIdx ? ' active' : ''}`}
            onClick={() => setSelectedIdx(i)}
          >
            <span className="trends-tab-label">{p.label}</span>
            <span className="trends-tab-count">{p.job_count} jobs</span>
          </button>
        ))}
      </div>

      {/* keyword list with deltas */}
      <div className="trends-list">
        {current.keywords.map(({ keyword, count }, i) => {
          const prevCount = prevMap[keyword]
          const isNew = prev ? prevCount === undefined : false
          const delta = isNew ? 0 : (prev ? count - (prevCount || 0) : 0)
          return (
            <TrendRow
              key={keyword}
              rank={i + 1}
              keyword={keyword}
              count={count}
              delta={delta}
              isNew={isNew}
            />
          )
        })}
      </div>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export default function KeywordBank() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const [dataset, setDataset] = useState('missing') // 'missing' | 'overall' | 'trends'
  const [view, setView] = useState('bubbles')        // 'bubbles' | 'list'
  const [granularity, setGranularity] = useState('day')

  const [trendData, setTrendData] = useState(null)
  const [trendLoading, setTrendLoading] = useState(false)
  const [trendError, setTrendError] = useState(null)

  useEffect(() => {
    api.get('/api/jobs/keyword-bank')
      .then((res) => setData(res.data))
      .catch((err) => {
        const status = err?.response?.status
        const detail = err?.response?.data?.detail || err?.message || 'unknown'
        setError(`Could not load keyword data. (${status ?? 'network'}: ${detail})`)
      })
      .finally(() => setLoading(false))
  }, [])

  // fetch trend data when Trends mode active or granularity changes
  useEffect(() => {
    if (dataset !== 'trends') return
    setTrendLoading(true)
    setTrendError(null)
    api.get(`/api/jobs/keyword-trends?period=${granularity}`)
      .then((res) => setTrendData(res.data))
      .catch((err) => {
        const detail = err?.response?.data?.detail || err?.message || 'unknown'
        setTrendError(`Could not load trends. (${detail})`)
      })
      .finally(() => setTrendLoading(false))
  }, [dataset, granularity])

  if (loading) return <div className="kb-page"><div className="kb-loading">Loading keyword bank...</div></div>
  if (error) return <div className="kb-page"><div className="kb-loading kb-error">{error}</div></div>

  const { keywords = [], all_keywords = [], total_jobs_analyzed = 0 } = data || {}
  const isTrends = dataset === 'trends'
  const isOverall = dataset === 'overall'
  const activeKws = isOverall ? all_keywords : keywords

  const hot = activeKws.filter((k) => k.count >= 4)
  const warm = activeKws.filter((k) => k.count === 2 || k.count === 3)
  const cool = activeKws.filter((k) => k.count === 1)

  const subtitle = isTrends
    ? 'Keyword demand over time — spot rising and falling skills'
    : isOverall
      ? `${all_keywords.length} keywords across ${total_jobs_analyzed} jobs. Click any to copy.`
      : `${keywords.length} missing keywords across ${total_jobs_analyzed} jobs. Click any to copy.`

  return (
    <div className="kb-page">
      <div className="kb-header">
        <div>
          <p className="section-kicker">Resume Intelligence</p>
          <h1 className="kb-title">Keyword Bank</h1>
          <p className="kb-subtitle">{subtitle}</p>
        </div>
        <div className="kb-controls">
          {/* dataset selector */}
          <div className="kb-view-toggle">
            <button type="button" className={`kb-toggle-btn${dataset === 'missing' ? ' active' : ''}`} onClick={() => setDataset('missing')}>Missing</button>
            <button type="button" className={`kb-toggle-btn${dataset === 'overall' ? ' active' : ''}`} onClick={() => setDataset('overall')}>Overall</button>
            <button type="button" className={`kb-toggle-btn${dataset === 'trends' ? ' active' : ''}`} onClick={() => setDataset('trends')}>Trends</button>
          </div>
          {/* view selector — only shown outside Trends */}
          {!isTrends && (
            <div className="kb-view-toggle">
              <button type="button" className={`kb-toggle-btn${view === 'bubbles' ? ' active' : ''}`} onClick={() => setView('bubbles')}>Bubbles</button>
              <button type="button" className={`kb-toggle-btn${view === 'list' ? ' active' : ''}`} onClick={() => setView('list')}>Sections</button>
            </div>
          )}
        </div>
      </div>

      {isTrends ? (
        <TrendsPane
          trendData={trendData}
          trendLoading={trendLoading}
          trendError={trendError}
          granularity={granularity}
          setGranularity={setGranularity}
        />
      ) : activeKws.length === 0 ? (
        <div className="kb-empty">
          <p>No keywords found. Either all JDs match your skills or job descriptions are not loaded yet.</p>
        </div>
      ) : view === 'bubbles' ? (
        <div className="kb-bubbles-pane">
          <BubbleCloud keywords={activeKws} />
          <div className="kb-legend">
            <span className="legend-dot legend-dot--hot" /> High demand (4+ jobs)
            <span className="legend-dot legend-dot--warm" /> In multiple jobs
            <span className="legend-dot legend-dot--cool" /> Seen once
          </div>
        </div>
      ) : (
        <div className="kb-sections-pane">
          <KeywordSection title="High demand" subtitle={isOverall ? 'In 4+ jobs' : 'Missing in 4+ jobs'} keywords={hot} accent="hot" />
          <KeywordSection title="In multiple jobs" subtitle={isOverall ? 'In 2-3 jobs' : 'Missing in 2-3 jobs'} keywords={warm} accent="warm" />
          <KeywordSection title="Seen once" subtitle={isOverall ? 'In 1 job' : 'Missing in 1 job'} keywords={cool} accent="cool" />
        </div>
      )}
    </div>
  )
}
