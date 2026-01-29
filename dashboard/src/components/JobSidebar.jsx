import { useState, useEffect } from 'react'
import './JobSidebar.css'

const JobSidebar = ({ job, onClose }) => {
    const [expandedSections, setExpandedSections] = useState({
        jobDescription: false,
        analysis: false,
        location: false,
        techStack: false,
        points: false
    })

    const [editMode, setEditMode] = useState(false)
    const [editedData, setEditedData] = useState({
        location: '',
        tech_stack: {},
        points: []
    })
    const [originalData, setOriginalData] = useState(null)
    const [saving, setSaving] = useState(false)
    const [jsonMode, setJsonMode] = useState(false)
    const [jsonText, setJsonText] = useState('')
    const [jsonError, setJsonError] = useState('')
    const [saveMessage, setSaveMessage] = useState('')

    // PDF Generation state
    const [generating, setGenerating] = useState(false)
    const [pdfUrl, setPdfUrl] = useState(null)
    const [generateError, setGenerateError] = useState('')

    if (!job) return null

    // Parse Analysis JSON and normalize format
    let analysisData = null
    try {
        if (job['Analysis Data']) {
            analysisData = job['Analysis Data']
        } else if (job['Analysis JSON']) {
            analysisData = typeof job['Analysis JSON'] === 'string'
                ? JSON.parse(job['Analysis JSON'])
                : job['Analysis JSON']
        }
    } catch (e) {
        console.error('Failed to parse Analysis JSON:', e)
    }

    // Normalize old format to new format
    const normalizeData = (data) => {
        if (!data) return { location: job.Location || '', tech_stack: {}, points: [], ats_score: 'N/A' }

        // Handle ATS score (old: ai_ats_score, new: ats_score)
        const atsScore = data.ats_score || data.ai_ats_score || 'N/A'

        // Handle location
        const location = data.location || job.Location || ''

        // Handle tech stack
        const techStack = data.tech_stack || {}

        // Handle points (old: suggested_resume_point_1/2, new: points array)
        let points = []
        if (data.points && Array.isArray(data.points)) {
            points = data.points
        } else {
            // Convert old format
            if (data.suggested_resume_point_1) points.push(data.suggested_resume_point_1)
            if (data.suggested_resume_point_2) points.push(data.suggested_resume_point_2)
        }

        return { location, tech_stack: techStack, points, ats_score: atsScore }
    }

    const normalizedData = normalizeData(analysisData)

    // Initialize editedData when job changes
    useEffect(() => {
        // Parse analysis data from job
        let jobAnalysisData = null
        try {
            if (job['Analysis Data']) {
                jobAnalysisData = job['Analysis Data']
            } else if (job['Analysis JSON']) {
                jobAnalysisData = typeof job['Analysis JSON'] === 'string'
                    ? JSON.parse(job['Analysis JSON'])
                    : job['Analysis JSON']
            }
        } catch (e) {
            console.error('Failed to parse Analysis JSON in useEffect:', e)
        }

        // Normalize the data
        const normalize = (data) => {
            if (!data) return { location: job.Location || '', tech_stack: {}, points: [], ats_score: 'N/A' }
            const atsScore = data.ats_score || data.ai_ats_score || 'N/A'
            const location = data.location || job.Location || ''
            const techStack = data.tech_stack || {}
            let points = []
            if (data.points && Array.isArray(data.points)) {
                points = data.points
            } else {
                if (data.suggested_resume_point_1) points.push(data.suggested_resume_point_1)
                if (data.suggested_resume_point_2) points.push(data.suggested_resume_point_2)
            }
            return { location, tech_stack: techStack, points, ats_score: atsScore }
        }

        const data = normalize(jobAnalysisData)
        setEditedData(data)
        setOriginalData(data)
    }, [job])

    // Lock body scroll when sidebar is open
    useEffect(() => {
        document.body.style.overflow = 'hidden'
        return () => {
            document.body.style.overflow = 'unset'
        }
    }, [])

    const toggleSection = (section) => {
        setExpandedSections(prev => ({
            ...prev,
            [section]: !prev[section]
        }))
    }

    const handleEdit = () => {
        setEditMode(true)
        // Auto-expand editable sections
        setExpandedSections(prev => ({
            ...prev,
            location: true,
            techStack: true,
            points: true
        }))
    }

    const handleCancel = () => {
        setEditedData(originalData)
        setEditMode(false)
        setSaveMessage('')
    }

    const handleSave = async () => {
        setSaving(true)
        setSaveMessage('')

        try {
            // Get the row index from job data
            const rowIndex = job._rowIndex || 0

            const response = await fetch('http://localhost:8000/api/update-analysis', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    row_index: rowIndex,
                    location: editedData.location,
                    tech_stack: editedData.tech_stack,
                    points: editedData.points
                })
            })

            const result = await response.json()

            if (response.ok) {
                setSaveMessage('✅ Changes saved successfully!')
                setOriginalData(editedData)
                setEditMode(false)
                // Clear message after 3 seconds
                setTimeout(() => setSaveMessage(''), 3000)
            } else {
                setSaveMessage(`❌ Error: ${result.detail || 'Failed to save'}`)
            }
        } catch (error) {
            console.error('Save error:', error)
            setSaveMessage(`❌ Error: ${error.message}`)
        } finally {
            setSaving(false)
        }
    }

    const handleGenerateResume = async () => {
        setGenerating(true)
        setGenerateError('')
        setPdfUrl(null)

        try {
            const rowIndex = job._rowIndex || 0

            const response = await fetch('http://localhost:8000/api/generate-resume', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    row_index: rowIndex,
                    company_name: job.Company,
                    location: editedData.location,
                    tech_stack: editedData.tech_stack,
                    points: editedData.points
                })
            })

            const result = await response.json()

            if (response.ok) {
                setPdfUrl(result.pdf_url)
            } else {
                setGenerateError(`Generated Failed: ${result.detail || 'Unknown error'}`)
            }
        } catch (error) {
            setGenerateError(`Network Error: ${error.message}`)
        } finally {
            setGenerating(false)
        }
    }

    // Handlers for tech stack edits
    const handleTechStackChange = (category, value) => {
        const skills = value.split(',').map(s => s.trim()).filter(s => s)
        setEditedData(prev => ({
            ...prev,
            tech_stack: {
                ...prev.tech_stack,
                [category]: skills
            }
        }))
    }

    const handleTechStackKeyChange = (oldKey, newKey) => {
        if (!newKey.trim()) return
        const newStack = { ...editedData.tech_stack }
        newStack[newKey] = newStack[oldKey]
        delete newStack[oldKey]
        setEditedData(prev => ({ ...prev, tech_stack: newStack }))
    }

    const handleTechStackDelete = (category) => {
        const newStack = { ...editedData.tech_stack }
        delete newStack[category]
        setEditedData(prev => ({ ...prev, tech_stack: newStack }))
    }

    const handleTechStackAdd = () => {
        setEditedData(prev => ({
            ...prev,
            tech_stack: {
                ...prev.tech_stack,
                "New Category": []
            }
        }))
    }

    // Handlers for points edits
    const handlePointChange = (index, value) => {
        const newPoints = [...editedData.points]
        newPoints[index] = value
        setEditedData(prev => ({ ...prev, points: newPoints }))
    }

    const handlePointDelete = (index) => {
        const newPoints = editedData.points.filter((_, i) => i !== index)
        setEditedData(prev => ({ ...prev, points: newPoints }))
    }

    const handlePointAdd = () => {
        setEditedData(prev => ({
            ...prev,
            points: [...prev.points, "\\item New point"]
        }))
    }

    return (
        <>
            <div className="sidebar-overlay" onClick={onClose}>
                <div className="sidebar" onClick={e => e.stopPropagation()}>
                    <div className="sidebar-header">
                        <div>
                            <h2 className="sidebar-title">{job.Title}</h2>
                            <h3 className="sidebar-company">
                                {job.Company}
                                <a href={job.Link} target="_blank" rel="noopener noreferrer" className="job-link-icon" title="View Job Post">
                                    🔗
                                </a>
                            </h3>
                        </div>
                        <button className="close-btn" onClick={onClose}>&times;</button>
                    </div>

                    <div className="sidebar-content">
                        {/* Top Stats */}
                        <div className="ats-score-section">
                            <div className="score-badge" style={{
                                background: `conic-gradient(#4caf50 ${normalizedData.ats_score || 0}%, #eee 0)`
                            }}>
                                <span className="score-text">{normalizedData.ats_score}</span>
                            </div>
                            <span className="score-label">ATS Score</span>
                        </div>

                        {/* Location Section */}
                        <div className="detail-section">
                            <div
                                className="section-header"
                                onClick={() => toggleSection('location')}
                            >
                                <h3>Location</h3>
                                <span className={`arrow ${expandedSections.location ? 'expanded' : ''}`}>▼</span>
                            </div>
                            <div className={`section-content ${expandedSections.location ? 'expanded' : ''}`}>
                                {editMode ? (
                                    <input
                                        type="text"
                                        className="edit-input"
                                        value={editedData.location}
                                        onChange={(e) => setEditedData(prev => ({
                                            ...prev,
                                            location: e.target.value
                                        }))}
                                    />
                                ) : (
                                    <p>{editedData.location}</p>
                                )}
                            </div>
                        </div>

                        {/* Tech Stack Section */}
                        <div className="detail-section">
                            <div
                                className="section-header"
                                onClick={() => toggleSection('techStack')}
                            >
                                <h3>Tech Stack</h3>
                                <span className={`arrow ${expandedSections.techStack ? 'expanded' : ''}`}>▼</span>
                            </div>
                            <div className={`section-content ${expandedSections.techStack ? 'expanded' : ''}`}>
                                {editMode ? (
                                    <div className="tech-stack-editor">
                                        <div className="editor-toolbar">
                                            <button
                                                className={`mode-btn ${!jsonMode ? 'active' : ''}`}
                                                onClick={() => setJsonMode(false)}
                                            >
                                                Visual Editor
                                            </button>
                                            <button
                                                className={`mode-btn ${jsonMode ? 'active' : ''}`}
                                                onClick={() => {
                                                    setJsonMode(true)
                                                    setJsonText(JSON.stringify(editedData.tech_stack, null, 2))
                                                }}
                                            >
                                                JSON Editor
                                            </button>
                                        </div>

                                        {jsonMode ? (
                                            <div className="json-editor-container">
                                                <textarea
                                                    className="json-editor"
                                                    value={jsonText}
                                                    onChange={(e) => {
                                                        setJsonText(e.target.value)
                                                        try {
                                                            const parsed = JSON.parse(e.target.value)
                                                            setEditedData(prev => ({
                                                                ...prev,
                                                                tech_stack: parsed
                                                            }))
                                                            setJsonError('')
                                                        } catch (err) {
                                                            setJsonError(err.message)
                                                        }
                                                    }}
                                                />
                                                {jsonError && <div className="json-error">{jsonError}</div>}
                                            </div>
                                        ) : (
                                            <div className="visual-editor">
                                                {editedData.tech_stack && Object.keys(editedData.tech_stack).length > 0 ? (
                                                    Object.entries(editedData.tech_stack).map(([category, skills]) => (
                                                        <div key={category} className="tech-category-edit">
                                                            <div className="category-header-edit" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                                <input
                                                                    type="text"
                                                                    className="category-key-input"
                                                                    value={category}
                                                                    onChange={(e) => handleTechStackKeyChange(category, e.target.value)}
                                                                    placeholder="Category Name"
                                                                />
                                                                <button
                                                                    className="delete-point-btn"
                                                                    onClick={() => handleTechStackDelete(category)}
                                                                    title="Delete Category"
                                                                    style={{ width: '24px', height: '24px', fontSize: '0.8rem' }}
                                                                >
                                                                    🗑️
                                                                </button>
                                                            </div>
                                                            <input
                                                                type="text"
                                                                className="edit-input"
                                                                value={Array.isArray(skills) ? skills.join(', ') : ''}
                                                                onChange={(e) => handleTechStackChange(category, e.target.value)}
                                                                placeholder="Comma-separated skills"
                                                            />
                                                        </div>
                                                    ))
                                                ) : (
                                                    <div className="no-data-msg">No tech stack data. Add a category below.</div>
                                                )}
                                                <button className="add-point-btn" onClick={handleTechStackAdd} style={{ marginTop: '16px' }}>
                                                    ➕ Add Category
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                ) : (
                                    <div className="tech-stack-display">
                                        {editedData.tech_stack && Object.entries(editedData.tech_stack).map(([category, skills]) => (
                                            <div key={category} className="tech-category">
                                                <h4 className="category-title">{category}</h4>
                                                <div className="tech-skills">
                                                    {Array.isArray(skills) && skills.map((skill, idx) => (
                                                        <span key={idx} className="tech-skill-tag">{skill}</span>
                                                    ))}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Resume Points Section */}
                        <div className="detail-section">
                            <div
                                className="section-header"
                                onClick={() => toggleSection('points')}
                            >
                                <h3>Resume Points</h3>
                                <span className={`arrow ${expandedSections.points ? 'expanded' : ''}`}>▼</span>
                            </div>
                            <div className={`section-content ${expandedSections.points ? 'expanded' : ''}`}>
                                {editMode ? (
                                    <div className="points-editor">
                                        {editedData.points.map((point, idx) => (
                                            <div key={idx} className="point-edit-row">
                                                <textarea
                                                    value={point}
                                                    onChange={(e) => handlePointChange(idx, e.target.value)}
                                                    className="point-textarea"
                                                />
                                                <button
                                                    className="delete-point-btn"
                                                    onClick={() => handlePointDelete(idx)}
                                                >
                                                    🗑️
                                                </button>
                                            </div>
                                        ))}
                                        <button className="add-point-btn" onClick={handlePointAdd}>
                                            ➕ Add Point
                                        </button>
                                    </div>
                                ) : (
                                    <ul className="points-list">
                                        {editedData.points && editedData.points.map((point, idx) => (
                                            <li key={idx}>
                                                {point.replace(/^\\item\s*/, '')}
                                            </li>
                                        ))}
                                    </ul>
                                )}
                            </div>
                        </div>

                        {/* Action Buttons */}
                        <div className="sidebar-footer">
                            {editMode ? (
                                <>
                                    <button className="cancel-btn" onClick={handleCancel} disabled={saving}>
                                        Cancel
                                    </button>
                                    <button className="save-btn" onClick={handleSave} disabled={saving}>
                                        {saving ? 'Saving...' : 'Save Changes'}
                                    </button>
                                </>
                            ) : (
                                <>
                                    <button className="edit-btn" onClick={handleEdit}>
                                        Edit Data
                                    </button>
                                    <button
                                        className="generate-btn"
                                        onClick={handleGenerateResume}
                                        disabled={generating}
                                    >
                                        {generating ? 'Generating...' : 'Generate Resume PDF'}
                                    </button>
                                </>
                            )}
                        </div>

                        {saveMessage && <div className="save-message success">{saveMessage}</div>}
                        {generateError && <div className="save-message error">{generateError}</div>}

                        {pdfUrl && (
                            <div className="pdf-success">
                                <p>✅ Resume Generated Successfully!</p>
                                <div className="pdf-actions">
                                    <a href={`http://localhost:8000${pdfUrl}`} target="_blank" rel="noopener noreferrer" className="download-btn">
                                        Download PDF
                                    </a>
                                    <button className="copy-path-btn" onClick={() => navigator.clipboard.writeText(pdfUrl)}>
                                        Copy Link
                                    </button>
                                </div>
                                <div className="pdf-preview" style={{ marginTop: '16px' }}>
                                    <iframe
                                        src={`http://localhost:8000${pdfUrl}`}
                                        width="100%"
                                        height="400px"
                                        style={{ border: '1px solid #e2e8f0', borderRadius: '8px' }}
                                        title="Resume Preview"
                                    />
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </>
    )
}

export default JobSidebar
