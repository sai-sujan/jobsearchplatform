import { useEffect, useRef, useState } from 'react'
import { api } from '../lib/api'
import { getJobId, normalizeStatus } from '../lib/jobs'
import './TailorPage.css'

function Chip({ children, tone = 'neutral' }) {
  return <span className={`tp-chip tp-chip-${tone}`}>{children}</span>
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
          No resume uploaded — AI bullets will be generic. <a href="/profile" style={{ color: '#b45309', fontWeight: 600 }}>Upload your resume in Settings →</a>
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
        {/* Left: JD + ATS score */}
        <div className="tp-jd-card">
          <div className="tp-jd-head">
            <strong>Job Description</strong>
            {matchedScore !== null && (
              <span className={`tp-ats-badge ${atsTone}`}>{matchedScore}% match</span>
            )}
          </div>

          {matchedScore !== null && (
            <div className="tp-ats-score-block">
              <div className="tp-ats-num">{matchedScore}%</div>
              <span className="tp-ats-lbl">ATS MATCH SCORE</span>
              <div className="tp-ats-bar"><span style={{ width: `${matchedScore}%` }} /></div>
            </div>
          )}

          <textarea
            className="tp-jd-textarea"
            value={jd}
            onChange={(e) => setJd(e.target.value)}
            placeholder="Select a job above — the description will load here, or paste manually."
            rows={matchedScore !== null ? 6 : 10}
          />
          <p className="tp-jd-hint">
            {selectedJob ? `${selectedJob.Company} · ${selectedJob.Title}` : 'Select a job or paste a JD above'}
          </p>
        </div>

        {/* Right: Resume columns */}
        <div className="tp-resumes">
          <div className="tp-resume-col">
            <div className="tp-col-head">
              <strong>Base Resume</strong>
              <span className="tp-muted">{hasResume ? 'From profile' : 'Not uploaded'}</span>
            </div>
            {baseResume?.resume?.original_text ? (
              <div className="tp-resume-body">
                <pre className="tp-base-snippet">
                  {baseResume.resume.original_text.slice(0, 2200)}{baseResume.resume.original_text.length > 2200 ? '\n…' : ''}
                </pre>
              </div>
            ) : (
              <div className="tp-empty-state">
                <div className="tp-empty-icon">
                  <svg viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" /><polyline points="10 9 9 9 8 9" />
                  </svg>
                </div>
                <strong>No resume uploaded</strong>
                <p>Upload your resume in Settings for AI-grounded tailoring.</p>
                <a href="/profile" style={{ fontSize: '0.8rem', color: '#4f46e5', fontWeight: 600 }}>Go to Settings →</a>
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

function PreviewView({ setView, tailoredData, selectedJob, onNotesChange, onboarding }) {
  const [generatingPdf, setGeneratingPdf] = useState(false)
  const [pdfUrl, setPdfUrl] = useState(null)
  const [pdfError, setPdfError] = useState('')
  const [saved, setSaved] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')
  const [qaTab, setQaTab] = useState('qa')

  const atsScore = tailoredData?.ats_score || null
  const points = tailoredData?.points || []

  // Auto-generate PDF when entering preview
  useEffect(() => {
    if (!selectedJob?.id) return
    setGeneratingPdf(true)
    setPdfError('')
    const API_BASE = import.meta.env.VITE_API_URL || 'http://127.0.0.1:5001'
    api.post(`/api/jobs/${selectedJob.id}/resume`)
      .then((resp) => {
        const url = `${API_BASE}${resp.data.pdf_url}`
        setPdfUrl(url)
      })
      .catch((e) => {
        setPdfError(e?.response?.data?.detail || 'PDF generation failed.')
      })
      .finally(() => setGeneratingPdf(false))
  }, [selectedJob?.id])

  const handleDownload = () => {
    if (pdfUrl) window.open(pdfUrl, '_blank')
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
          <h1>Resume Preview</h1>
          {selectedJob && <p className="tp-muted">Tailored for {selectedJob.Title} at {selectedJob.Company}</p>}
        </div>
        <div className="tp-topbar-actions">
          <button type="button" className="tp-btn-ghost" onClick={handleDownload} disabled={!pdfUrl || generatingPdf}>
            <svg viewBox="0 0 24 24"><path d="M12 3v12m0 0l-4-4m4 4l4-4M5 21h14" /></svg>
            {generatingPdf ? 'Compiling…' : 'Download PDF'}
          </button>
          <button type="button" className="tp-btn-primary" onClick={handleSave} disabled={saved}>
            {saved ? 'Saved ✓' : 'Save to Job Card'}
          </button>
        </div>
      </header>

      {errorMsg && <div className="tp-error-banner">{errorMsg}</div>}

      <div className="tp-preview-layout">
        <div className="tp-preview-resume tp-pdf-panel">
          {generatingPdf && (
            <div className="tp-pdf-loading">
              <div className="tp-pdf-spinner" />
              <p>Compiling LaTeX resume…</p>
              <small>This takes about 10–15 seconds</small>
            </div>
          )}
          {!generatingPdf && pdfError && (
            <div className="tp-pdf-error">
              <p>{pdfError}</p>
              <button type="button" className="tp-btn-ghost" onClick={() => {
                setGeneratingPdf(true); setPdfError('')
                api.post(`/api/jobs/${selectedJob.id}/resume`)
                  .then((r) => { const b = import.meta.env.VITE_API_URL || 'http://127.0.0.1:5001'; setPdfUrl(`${b}${r.data.pdf_url}`) })
                  .catch((e) => setPdfError(e?.response?.data?.detail || 'Failed.'))
                  .finally(() => setGeneratingPdf(false))
              }}>Retry</button>
            </div>
          )}
          {!generatingPdf && pdfUrl && (
            <iframe
              src={pdfUrl}
              title="Tailored Resume PDF"
              className="tp-pdf-iframe"
            />
          )}
        </div>

        <aside className="tp-qa">
          <div className="tp-qa-tabs">
            <button type="button" className={qaTab === 'qa' ? 'active' : ''} onClick={() => setQaTab('qa')}>Final QA</button>
            <button type="button" className={qaTab === 'details' ? 'active' : ''} onClick={() => setQaTab('details')}>Job Details</button>
          </div>

          {qaTab === 'qa' && (
            <>
              <div className="tp-qa-score-card">
                <span className="tp-qa-label">Final ATS Score</span>
                <div className="tp-qa-score">{atsScore !== null ? `${atsScore}%` : '—'}</div>
                {atsScore !== null && <div className="tp-qa-bar"><span style={{ width: `${atsScore}%` }} /></div>}
                <span className="tp-qa-hint">
                  {atsScore !== null ? `${atsScore >= 80 ? 'Strong match' : 'Needs improvement'} — AI tailored` : 'Run tailor to compute score'}
                </span>
              </div>

              <div className="tp-qa-checklist">
                <div className="tp-qa-checklist-title">OPTIMIZATION CHECKLIST</div>
                {[
                  { label: 'Tailored Points', done: points.length > 0, sub: `${points.length} bullets generated` },
                  { label: 'Skill Keywords', done: !!tailoredData?.suggested_tech_stack, sub: tailoredData?.suggested_tech_stack ? 'Suggested skills added' : 'Not yet generated' },
                  { label: 'Location Match', done: !!tailoredData?.location, sub: tailoredData?.location || 'Not set' },
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
                  </div>
                </div>
              )}
            </>
          )}

          {qaTab === 'details' && selectedJob && (
            <div className="tp-qa-details">
              <div className="tp-qa-checklist-title">JOB DETAILS</div>
              <div className="tp-qa-detail-row"><strong>Title</strong><span>{selectedJob.Title || '—'}</span></div>
              <div className="tp-qa-detail-row"><strong>Company</strong><span>{selectedJob.Company || '—'}</span></div>
              <div className="tp-qa-detail-row"><strong>Location</strong><span>{selectedJob.Location || '—'}</span></div>
              <div className="tp-qa-detail-row"><strong>Type</strong><span>{selectedJob['Job Type'] || '—'}</span></div>
              <div className="tp-qa-detail-row"><strong>Salary</strong><span>{selectedJob.Salary || selectedJob.salary || '—'}</span></div>
              {selectedJob.Link && (
                <div className="tp-qa-detail-row"><strong>Link</strong><a href={selectedJob.Link} target="_blank" rel="noreferrer" style={{ color: '#4f46e5', fontSize: 12 }}>View posting ↗</a></div>
              )}
              {(selectedJob.Description || selectedJob.description) && (
                <div style={{ marginTop: 10 }}>
                  <div className="tp-qa-checklist-title">DESCRIPTION</div>
                  <p style={{ fontSize: 12, color: '#475569', whiteSpace: 'pre-wrap', maxHeight: 200, overflowY: 'auto', lineHeight: 1.5 }}>
                    {(selectedJob.Description || selectedJob.description || '').slice(0, 800)}
                    {(selectedJob.Description || selectedJob.description || '').length > 800 ? '…' : ''}
                  </p>
                </div>
              )}
            </div>
          )}

          {qaTab === 'details' && !selectedJob && (
            <p style={{ fontSize: 13, color: '#94a3b8', padding: 12 }}>No job selected.</p>
          )}

          <div className="tp-qa-actions">
            <button type="button" className="tp-btn-ghost-full" onClick={() => setView('tailor')}>Return to Edit</button>
            <button type="button" className="tp-btn-primary-full" onClick={handleSave} disabled={saved}>
              {saved ? 'Saved ✓' : 'Finalize & Save'}
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
          selectedJob={selectedJob}
          onNotesChange={onNotesChange}
          onboarding={onboarding}
        />
      )}
    </section>
  )
}

export default TailorPage
