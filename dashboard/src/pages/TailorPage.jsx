import { useEffect, useMemo, useRef, useState } from 'react'
import { api } from '../lib/api'
import { getJobId, normalizeStatus } from '../lib/jobs'
import './TailorPage.css'

// ── Resume text parser ───────────────────────────────────────────────────────

const SECTION_MAP = {
  TECHNICALSKILLS: 'skills', SKILLS: 'skills', CORETECHNICALSKILLS: 'skills',
  WORKEXPERIENCE: 'experience', EXPERIENCE: 'experience', PROFESSIONALEXPERIENCE: 'experience',
  EDUCATION: 'education', PROJECTS: 'projects', CERTIFICATIONS: 'certifications',
  AWARDS: 'awards', SUMMARY: 'summary', PROFILE: 'summary',
}
const HEADING_RE = /^[A-Z][A-Z &/]{2,40}$/

function sectionKey(line) {
  const k = line.replace(/\s+/g, '').toUpperCase()
  return SECTION_MAP[k] || (HEADING_RE.test(line) ? line.toLowerCase() : null)
}

function parseSkillLine(line) {
  // "Programming LanguagesPython, SQL" → split where label ends (last lowercase) before value starts (next uppercase)
  const m = line.match(/^([A-Z][A-Za-z&/ ]*?[a-z])([A-Z].*)$/)
  if (m) return { label: m[1].trim(), value: m[2].trim() }
  // fallback: no camelCase split found → treat whole line as value
  return { label: '', value: line }
}

function parseResumeText(text) {
  if (!text || text.length < 30) return { ok: false }
  const clean = text.replace(/\r/g, '').replace(/\u00A0/g, ' ').trim()
  const lines = clean.split('\n').map((l) => l.trim()).filter(Boolean)

  // split into buckets by section headings
  const buckets = [] // [{key, lines[]}]
  let headerLines = []
  let foundFirstSection = false
  let cur = null

  for (const line of lines) {
    const key = sectionKey(line)
    if (key && SECTION_MAP[line.replace(/\s+/g, '').toUpperCase()]) {
      foundFirstSection = true
      if (cur) buckets.push(cur)
      cur = { key: SECTION_MAP[line.replace(/\s+/g, '').toUpperCase()], lines: [] }
    } else if (!foundFirstSection) {
      headerLines.push(line)
    } else {
      cur?.lines.push(line)
    }
  }
  if (cur) buckets.push(cur)

  // parse header — a contacts line has an email/phone; a title line may have | but no @
  const isContactLine = (l) => l.includes('@') || /\(\d{3}\)/.test(l) || /\d{3}[-.\s]\d{3}[-.\s]\d{4}/.test(l)
  const header = { name: '', title: '', contacts: [] }
  if (headerLines.length > 0) {
    header.name = headerLines[0]
    if (headerLines[1]) {
      if (isContactLine(headerLines[1])) {
        // line 1 is already the contact line (no title)
        header.contacts = headerLines[1].split(/\s*\|\s*/).map((s) => s.trim()).filter(Boolean)
      } else {
        header.title = headerLines[1]
        if (headerLines[2]) {
          if (isContactLine(headerLines[2]) || headerLines[2].includes('|')) {
            header.contacts = headerLines[2].split(/\s*\|\s*/).map((s) => s.trim()).filter(Boolean)
          }
        }
      }
    }
  }

  // parse skills
  const skillsBucket = buckets.find((b) => b.key === 'skills')
  const skills = (skillsBucket?.lines || []).map(parseSkillLine).filter((s) => s.value)

  // parse experience
  const DATE_RE = /(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+\d{4}|\d{4}\s*[–\-]\s*(?:\d{4}|Present)/i
  const hasDate = (l) => DATE_RE.test(l)

  const expBucket = buckets.find((b) => b.key === 'experience')
  const experience = []
  if (expBucket) {
    let role = null
    for (const line of expBucket.lines) {
      const isBullet = /^[•\-\u2022\*]/.test(line)

      if (isBullet) {
        if (!role) role = { title: '', company: '', location: '', dates: '', bullets: [] }
        role.bullets.push(line.replace(/^[•\-\u2022\*]\s*/, ''))
        continue
      }

      // Lowercase-start line after bullets = wrapped continuation of previous bullet
      if (role && role.bullets.length > 0 && /^[a-z]/.test(line)) {
        role.bullets[role.bullets.length - 1] += ' ' + line
        continue
      }

      if (hasDate(line)) {
        // "Compass Group January 2025 – Present" → company + dates
        const dateM = line.match(/^(.+?)\s+((?:Jan\w*|Feb\w*|Mar\w*|Apr\w*|May|Jun\w*|Jul\w*|Aug\w*|Sep\w*|Oct\w*|Nov\w*|Dec\w*)\s+\d{4}.*|\d{4}.*)$/i)
        if (role) {
          role.company = dateM ? dateM[1].trim() : line
          role.dates   = dateM ? dateM[2].trim() : ''
        }
      } else {
        // New role title line — greedy split extracts trailing "City, ST/USA"
        if (role) experience.push(role)
        role = { title: '', company: '', location: '', dates: '', bullets: [] }
        const locM = line.match(/^(.+)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*,\s*(?:USA|Remote|[A-Z]{2,3})\s*(?:\(.*\))?)$/)
        if (locM) { role.title = locM[1].trim(); role.location = locM[2].trim() }
        else { role.title = line }
      }
    }
    if (role) experience.push(role)
  }

  // generic other sections
  const other = buckets
    .filter((b) => b.key !== 'skills' && b.key !== 'experience')
    .map((b) => ({ heading: b.key.charAt(0).toUpperCase() + b.key.slice(1), lines: b.lines }))
    .filter((b) => b.lines.length > 0)

  const ok = !!(header.name && (skills.length > 0 || experience.length > 0))
  return { ok, header, skills, experience, other }
}

// ── BaseResumeCard component ──────────────────────────────────────────────────

function BaseResumeCard({ text }) {
  const parsed = useMemo(() => parseResumeText(text), [text])

  if (!parsed.ok) {
    return (
      <div className="tp-resume-body">
        <div className="tp-base-fallback">
          {text.split(/\n{2,}/).map((p, i) => <p key={i}>{p.trim()}</p>)}
        </div>
      </div>
    )
  }

  const { header, skills, experience, other } = parsed

  return (
    <div className="tp-resume-body tp-base-structured">
      <header className="tp-br-header">
        <h3 className="tp-br-name">{header.name}</h3>
        {header.title && <div className="tp-br-title">{header.title}</div>}
        {header.contacts.length > 0 && (
          <div className="tp-br-contacts">
            {header.contacts.map((c, i) => <span key={i} className="tp-br-contact">{c}</span>)}
          </div>
        )}
      </header>

      {skills.length > 0 && (
        <section className="tp-resume-section">
          <div className="tp-section-title">Technical Skills</div>
          <dl className="tp-br-skills">
            {skills.map((s, i) => (
              <div key={i} className="tp-br-skill-row">
                {s.label && <dt className="tp-br-skill-label">{s.label}</dt>}
                <dd className={`tp-br-skill-values${s.label ? '' : ' tp-br-skill-values-full'}`}>
                  {s.value.split(',').map((v) => v.trim()).filter(Boolean).map((v, j) => (
                    <span key={j} className="tp-skill">{v}</span>
                  ))}
                </dd>
              </div>
            ))}
          </dl>
        </section>
      )}

      {experience.length > 0 && (
        <section className="tp-resume-section">
          <div className="tp-section-title">Work Experience</div>
          {experience.map((r, i) => (
            <div key={i} className="tp-exp tp-br-role">
              <div className="tp-br-role-head">
                <strong>{r.title || r.company}</strong>
                {r.dates && <span className="tp-br-dates">{r.dates}</span>}
              </div>
              {(r.company && r.title ? r.company : '') && (
                <div className="tp-exp-meta">
                  {[r.company, r.location].filter(Boolean).join(' · ')}
                </div>
              )}
              {r.location && !r.company && (
                <div className="tp-exp-meta">{r.location}</div>
              )}
              {r.bullets.length > 0 && (
                <ul>
                  {r.bullets.map((b, j) => <li key={j}>{b}</li>)}
                </ul>
              )}
            </div>
          ))}
        </section>
      )}

      {other.map((sec, i) => (
        <section key={i} className="tp-resume-section">
          <div className="tp-section-title">{sec.heading}</div>
          <div className="tp-br-generic">
            {sec.lines.map((l, j) => <div key={j}>{l}</div>)}
          </div>
        </section>
      ))}
    </div>
  )
}

function TechStackGrid({ techStack }) {
  if (!techStack || Object.keys(techStack).length === 0) return null
  const skills = Object.values(techStack).flat().filter((s) => typeof s === 'string').slice(0, 16)
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
      {skills.map((s) => (
        <span key={s} className="tp-skill tp-skill-new">{s}</span>
      ))}
    </div>
  )
}

function JobPicker({ jobs, selectedId, onChange }) {
  return (
    <div className="tp-job-picker">
      <label htmlFor="tp-job-select" style={{ fontSize: 12, fontWeight: 700, color: '#64748b', letterSpacing: '0.06em', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>Target Job</label>
      <select
        id="tp-job-select"
        value={selectedId}
        onChange={(e) => onChange(e.target.value)}
      >
        <option value="">— Select a job to tailor for —</option>
        {jobs.map((job) => (
          <option key={getJobId(job)} value={String(job.id || getJobId(job))}>
            {job.Company || 'Unknown'} — {job.Title || 'Untitled'}
          </option>
        ))}
      </select>
    </div>
  )
}

const TAILOR_STEPS = ['Analyzing job description…', 'Generating tailored bullets…', 'Computing ATS score…']

function TailorView({ jobs, setView, tailoredData, setTailoredData, selectedJobId, setSelectedJobId, onboarding }) {
  const selectedJob = jobs.find((j) => String(j.id || getJobId(j)) === selectedJobId) || null
  const [jd, setJd] = useState('')
  const [baseResume, setBaseResume] = useState(null)
  const [loadingTailor, setLoadingTailor] = useState(false)
  const [tailorStep, setTailorStep] = useState(0)
  const [errorMsg, setErrorMsg] = useState('')

  const hasResume = !!(onboarding?.resume?.original_text)

  useEffect(() => {
    if (selectedJob) {
      setJd(selectedJob['Job Description'] || selectedJob.Description || selectedJob.description || '')
      // Auto-load cached tailor data when switching jobs
      const existing = selectedJob['Analysis Data']
      if (existing?.points?.length > 0) setTailoredData(existing)
    }
  }, [selectedJobId])

  useEffect(() => {
    if (!onboarding) return
    setBaseResume(onboarding)
  }, [onboarding])

  useEffect(() => {
    if (!loadingTailor) { setTailorStep(0); return }
    const timer = setInterval(() => setTailorStep((s) => Math.min(s + 1, TAILOR_STEPS.length - 1)), 2500)
    return () => clearInterval(timer)
  }, [loadingTailor])

  const handleGenerate = async () => {
    if (!selectedJobId) { setErrorMsg('Select a job first.'); return }
    setLoadingTailor(true)
    setErrorMsg('')
    try {
      const resp = await api.post(`/api/jobs/${selectedJobId}/tailor`)
      setTailoredData(resp.data.tailored_data || {})
      setView('preview')
    } catch (e) {
      const detail = e?.response?.data?.detail || ''
      if (detail.includes('GROQ_API_KEYS')) {
        setErrorMsg('AI service not configured. Add GROQ_API_KEYS to .env to enable tailoring.')
      } else {
        setErrorMsg(detail || 'Tailor request failed. Try again.')
      }
    } finally {
      setLoadingTailor(false)
    }
  }

  const matchedScore = tailoredData?.ats_score || null

  const atsTone = matchedScore === null ? '' : matchedScore >= 80 ? 'good' : 'warn'

  return (
    <>
      <header className="tp-topbar">
        <div className="tp-topbar-title">
          <span className="tp-workspace-chip">◎ Workspace Active</span>
          <h1>AI Resume Tailor</h1>
        </div>
        <div className="tp-topbar-actions">
          {tailoredData && (
            <button type="button" className="tp-btn-ghost" onClick={() => setView('preview')}>
              View Preview →
            </button>
          )}
          <button
            type="button"
            className="tp-btn-primary"
            onClick={handleGenerate}
            disabled={!selectedJobId || loadingTailor}
          >
            {loadingTailor ? TAILOR_STEPS[tailorStep] : tailoredData ? 'Re-tailor' : 'Generate Preview'}
          </button>
        </div>
      </header>

      <JobPicker jobs={jobs} selectedId={selectedJobId} onChange={setSelectedJobId} />

      {!hasResume && (
        <div className="tp-banner tp-banner-warn">
          <svg viewBox="0 0 24 24"><path d="M12 9v4M12 17h.01M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" /></svg>
          No resume uploaded — AI bullets will be generic. <a href="/settings" style={{ color: '#b45309', fontWeight: 600 }}>Upload your resume in Settings →</a>
        </div>
      )}

      {errorMsg && <div className="tp-error-banner">{errorMsg}</div>}

      {loadingTailor && (
        <div className="tp-loading-steps">
          {TAILOR_STEPS.map((step, i) => (
            <div key={step} className={`tp-step ${i < tailorStep ? 'done' : i === tailorStep ? 'active' : ''}`}>
              <span className="tp-step-dot" />
              {step}
            </div>
          ))}
        </div>
      )}

      <div className="tp-workspace">
        {/* Top: JD full-width */}
        <div className="tp-jd-card">
          <div className="tp-jd-head">
            <strong>Job Description</strong>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
              {matchedScore !== null && (
                <span className={`tp-ats-badge ${atsTone}`}>{matchedScore}% ATS match</span>
              )}
              {matchedScore !== null && (
                <div className="tp-ats-bar-inline">
                  <span style={{ width: `${matchedScore}%` }} />
                </div>
              )}
              <span className="tp-jd-hint" style={{ margin: 0 }}>
                {selectedJob ? `${selectedJob.Company} · ${selectedJob.Title}` : 'Select a job or paste below'}
              </span>
            </div>
          </div>
          <textarea
            className="tp-jd-textarea"
            value={jd}
            onChange={(e) => setJd(e.target.value)}
            placeholder="Select a job above — the description will load here, or paste manually."
          />
        </div>

        {/* Bottom: Resume columns fill remaining height */}
        <div className="tp-resumes">
          <div className="tp-resume-col">
            <div className="tp-col-head">
              <strong>Base Resume</strong>
              <span className="tp-muted">{hasResume ? 'From profile' : 'Not uploaded'}</span>
            </div>
            {baseResume?.resume?.original_text ? (
              <BaseResumeCard text={baseResume.resume.original_text} />
            ) : (
              <div className="tp-empty-state">
                <div className="tp-empty-icon">
                  <svg viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" /><polyline points="10 9 9 9 8 9" />
                  </svg>
                </div>
                <strong>No resume uploaded</strong>
                <p>Upload your resume in Settings for AI-grounded tailoring.</p>
                <a href="/settings" style={{ fontSize: '0.8rem', color: '#4f46e5', fontWeight: 600 }}>Go to Settings →</a>
              </div>
            )}
          </div>

          <div className="tp-resume-col tp-resume-col-tailored">
            <div className="tp-col-head tp-col-head-tailored">
              <strong>
                <svg viewBox="0 0 24 24" className="tp-sparkle"><path d="M12 3l1.6 4.8L18 9.5l-4.4 1.7L12 16l-1.6-4.8L6 9.5l4.4-1.7z" /></svg>
                AI Tailored Version
              </strong>
              {tailoredData
                ? <span className="tp-done-count">Tailored ✓</span>
                : <span className="tp-pending-count">Not yet generated</span>
              }
            </div>

            {tailoredData ? (
              <div className="tp-resume-body">
                {tailoredData.points?.length > 0 && (
                  <div className="tp-resume-section">
                    <div className="tp-section-title">Tailored Bullets</div>
                    <ul className="tp-bullets">
                      {tailoredData.points.map((p, i) => (
                        <li key={i}>{typeof p === 'string' ? p : p.text || JSON.stringify(p)}</li>
                      ))}
                    </ul>
                  </div>
                )}
                {tailoredData.suggested_tech_stack && Object.keys(tailoredData.suggested_tech_stack).length > 0 && (
                  <div className="tp-resume-section">
                    <div className="tp-section-title">Suggested Skills</div>
                    <TechStackGrid techStack={tailoredData.suggested_tech_stack} />
                  </div>
                )}
                {tailoredData.location && (
                  <div className="tp-resume-section">
                    <div className="tp-section-title">Location</div>
                    <p style={{ fontSize: '0.82rem', color: '#374151', margin: 0 }}>{tailoredData.location}</p>
                  </div>
                )}
                <button type="button" className="tp-btn-primary" style={{ marginTop: '1rem', width: '100%' }} onClick={() => setView('preview')}>
                  View Full PDF Preview →
                </button>
              </div>
            ) : (
              <div className="tp-empty-state">
                <div className="tp-empty-icon">
                  <svg viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 3l1.6 4.8L18 9.5l-4.4 1.7L12 16l-1.6-4.8L6 9.5l4.4-1.7z" />
                  </svg>
                </div>
                <strong>Not yet generated</strong>
                <p>{selectedJobId ? 'Click "Generate Preview" to tailor your resume for this job.' : 'Select a job first, then generate.'}</p>
                {selectedJobId && (
                  <button type="button" className="tp-btn-primary" style={{ marginTop: 4 }} onClick={handleGenerate} disabled={loadingTailor}>
                    Generate Preview
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  )
}

function EditableBullet({ text, onChange, onRemove }) {
  return (
    <div className="tp-bullet-row">
      <span className="tp-bullet-dot" />
      <textarea
        className="tp-bullet-input"
        value={text}
        onChange={(e) => onChange(e.target.value)}
        rows={2}
      />
      <button type="button" className="tp-bullet-remove" onClick={onRemove} title="Remove">×</button>
    </div>
  )
}

function PreviewView({ setView, tailoredData, setTailoredData, selectedJob, onNotesChange }) {
  const [generatingPdf, setGeneratingPdf] = useState(false)
  const [pdfUrl, setPdfUrl] = useState(null)
  const [pdfError, setPdfError] = useState('')
  const [saved, setSaved] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')

  const atsScore = tailoredData?.ats_score || null
  const points = tailoredData?.points || []
  const techStack = tailoredData?.suggested_tech_stack || {}
  const location = tailoredData?.location || ''

  const updatePoint = (i, val) => setTailoredData((d) => ({ ...d, points: d.points.map((p, idx) => idx === i ? val : p) }))
  const removePoint = (i) => setTailoredData((d) => ({ ...d, points: d.points.filter((_, idx) => idx !== i) }))
  const addPoint = () => setTailoredData((d) => ({ ...d, points: [...(d.points || []), ''] }))
  const updateLocation = (val) => setTailoredData((d) => ({ ...d, location: val }))

  const handleGeneratePdf = () => {
    if (!selectedJob?.id) return
    setGeneratingPdf(true)
    setPdfError('')
    setPdfUrl(null)
    const API_BASE = import.meta.env.VITE_API_URL || 'http://127.0.0.1:5001'
    api.post(`/api/jobs/${selectedJob.id}/resume`)
      .then((resp) => setPdfUrl(`${API_BASE}${resp.data.pdf_url}`))
      .catch((e) => setPdfError(e?.response?.data?.detail || 'PDF generation failed.'))
      .finally(() => setGeneratingPdf(false))
  }

  const handleSave = async () => {
    if (!selectedJob) { setErrorMsg('No job selected.'); return }
    const summary = `[Tailored] ATS: ${atsScore ?? '?'}% | Points: ${points.length} | ${selectedJob.Company} — ${selectedJob.Title}`
    await onNotesChange?.(selectedJob, summary)
    setSaved(true)
  }

  return (
    <>
      <header className="tp-topbar">
        <div className="tp-topbar-title">
          <button type="button" className="tp-back-link" onClick={() => setView('tailor')}>← Back</button>
          <h1>Resume Editor</h1>
          {selectedJob && <p className="tp-muted">Tailored for {selectedJob.Title} at {selectedJob.Company}</p>}
        </div>
        <div className="tp-topbar-actions">
          <button type="button" className="tp-btn-ghost" onClick={handleGeneratePdf} disabled={generatingPdf || !selectedJob?.id}>
            <svg viewBox="0 0 24 24"><path d="M12 3v12m0 0l-4-4m4 4l4-4M5 21h14" /></svg>
            {generatingPdf ? 'Compiling PDF…' : pdfUrl ? 'Regenerate PDF' : 'Generate PDF'}
          </button>
          {pdfUrl && (
            <button type="button" className="tp-btn-ghost" onClick={() => window.open(pdfUrl, '_blank')}>
              Download ↗
            </button>
          )}
          <button type="button" className="tp-btn-primary" onClick={handleSave} disabled={saved}>
            {saved ? 'Saved ✓' : 'Save to Job Card'}
          </button>
        </div>
      </header>

      {errorMsg && <div className="tp-error-banner">{errorMsg}</div>}
      {pdfError && <div className="tp-error-banner">{pdfError} <button type="button" style={{ marginLeft: 8, fontWeight: 700, background: 'none', border: 'none', color: '#dc2626', cursor: 'pointer' }} onClick={handleGeneratePdf}>Retry</button></div>}
      {generatingPdf && (
        <div className="tp-loading-steps">
          <div className="tp-step active"><span className="tp-step-dot" />Compiling LaTeX resume…</div>
          <span className="tp-muted" style={{ fontSize: 12 }}>~10–15 seconds</span>
        </div>
      )}
      {pdfUrl && !generatingPdf && (
        <div className="tp-pdf-ready-banner">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
          PDF ready —
          <a href={pdfUrl} target="_blank" rel="noreferrer">Open in new tab ↗</a>
        </div>
      )}

      <div className="tp-preview-layout">
        {/* Left: editable resume content */}
        <div className="tp-edit-panel">
          <div className="tp-edit-section">
            <div className="tp-edit-section-head">
              <span className="tp-section-title" style={{ margin: 0, border: 0, padding: 0 }}>Experience Bullets</span>
              <button type="button" className="tp-add-bullet-btn" onClick={addPoint}>+ Add bullet</button>
            </div>
            {points.length === 0 ? (
              <p className="tp-muted" style={{ fontSize: 13, padding: '8px 0' }}>No bullets yet. Go back and generate tailored content.</p>
            ) : (
              points.map((p, i) => (
                <EditableBullet
                  key={i}
                  text={typeof p === 'string' ? p : p.text || ''}
                  onChange={(val) => updatePoint(i, val)}
                  onRemove={() => removePoint(i)}
                />
              ))
            )}
          </div>

          {Object.keys(techStack).length > 0 && (
            <div className="tp-edit-section">
              <div className="tp-section-title" style={{ margin: 0, border: 0, padding: '0 0 0.5rem' }}>Suggested Skills</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {Object.values(techStack).flat().filter((s) => typeof s === 'string').map((s) => (
                  <span key={s} className="tp-skill tp-skill-new">{s}</span>
                ))}
              </div>
            </div>
          )}

          <div className="tp-edit-section">
            <div className="tp-section-title" style={{ margin: 0, border: 0, padding: '0 0 0.5rem' }}>Location</div>
            <input
              className="tp-location-input"
              value={location}
              onChange={(e) => updateLocation(e.target.value)}
              placeholder="e.g. San Francisco, CA (Open to Relocate)"
            />
          </div>
        </div>

        {/* Right: score + job details */}
        <aside className="tp-qa">
          <div className="tp-qa-score-card">
            <span className="tp-qa-label">ATS Match Score</span>
            <div className="tp-qa-score">{atsScore !== null ? `${atsScore}%` : '—'}</div>
            {atsScore !== null && <div className="tp-qa-bar"><span style={{ width: `${atsScore}%` }} /></div>}
            <span className="tp-qa-hint">
              {atsScore !== null ? (atsScore >= 80 ? 'Strong match' : 'Needs improvement') : 'Run tailor to compute score'}
            </span>
          </div>

          <div className="tp-qa-checklist">
            <div className="tp-qa-checklist-title">CHECKLIST</div>
            {[
              { label: 'Tailored Bullets', done: points.length > 0, sub: `${points.length} bullets` },
              { label: 'Skills Updated', done: Object.keys(techStack).length > 0, sub: Object.keys(techStack).length > 0 ? 'AI-suggested skills added' : 'No skills yet' },
              { label: 'Location Set', done: !!location, sub: location || 'Not set' },
              { label: 'ATS Score', done: atsScore !== null && atsScore >= 75, warn: atsScore !== null && atsScore < 75, sub: atsScore !== null ? `Score: ${atsScore}%` : 'Not computed' },
            ].map((c) => (
              <div key={c.label} className={`tp-qa-row ${c.done ? 'done' : ''} ${c.warn ? 'warn' : ''}`}>
                <span className="tp-qa-mark">{c.warn ? '!' : c.done ? '✓' : '○'}</span>
                <div>
                  <strong>{c.label}</strong>
                  {c.sub && <p>{c.sub}</p>}
                </div>
              </div>
            ))}
          </div>

          {selectedJob && (
            <div className="tp-qa-targeting">
              <div className="tp-qa-checklist-title">TARGETING</div>
              <div className="tp-qa-targeting-card">
                <strong>{selectedJob.Title}</strong>
                <span>{selectedJob.Company}</span>
                {selectedJob.Location && <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>{selectedJob.Location}</span>}
              </div>
            </div>
          )}

          <div className="tp-qa-actions">
            <button type="button" className="tp-btn-ghost-full" onClick={() => setView('tailor')}>← Back to Workspace</button>
            <button type="button" className="tp-btn-primary-full" onClick={handleGeneratePdf} disabled={generatingPdf || !selectedJob?.id}>
              {generatingPdf ? 'Compiling…' : 'Generate & Download PDF'}
            </button>
          </div>
        </aside>
      </div>
    </>
  )
}

function TailorPage({ jobs = [], onNotesChange, onboarding }) {
  const [view, setView] = useState('tailor')
  const [tailoredData, setTailoredData] = useState(null)
  const [selectedJobId, setSelectedJobId] = useState('')

  const selectedJob = jobs.find((j) => String(j.id || getJobId(j)) === selectedJobId) || null

  return (
    <section className="tp-page">
      {view === 'tailor' ? (
        <TailorView
          jobs={jobs}
          setView={setView}
          tailoredData={tailoredData}
          setTailoredData={setTailoredData}
          selectedJobId={selectedJobId}
          setSelectedJobId={setSelectedJobId}
          onboarding={onboarding}
        />
      ) : (
        <PreviewView
          setView={setView}
          tailoredData={tailoredData}
          setTailoredData={setTailoredData}
          selectedJob={selectedJob}
          onNotesChange={onNotesChange}
        />
      )}
    </section>
  )
}

export default TailorPage
