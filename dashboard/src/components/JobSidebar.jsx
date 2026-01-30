import { useState, useEffect } from 'react'
import './JobSidebar.css'

const FIXED_TECH_STACK_CONST = {
    "Programming Languages": ["Python", "SQL"],
    "ML Frameworks & Libraries": ["TensorFlow", "PyTorch", "Scikit-learn", "Hugging Face Transformers"],
    "LLM & NLP Tools": ["LangChain", "LangSmith", "LlamaIndex", "Multi-Agents", "Finetuning (LoRA, QLoRA)", "OpenAI, Ollama", "RAG Systems"],
    "ML Specializations": ["Deep Learning", "Computer Vision", "Anomaly Detection"],
    "MLOps & Deployment": ["MLflow", "Git, GitHub Actions", "CI/CD Pipelines", "Model Deployment"],
    "Cloud & Infrastructure": ["AWS", "Azure"],
    "Databases & AI Infrastructure": ["PostgreSQL, MySQL, MongoDB", "Weaviate", "FAISS", "ChromaDB"],
    "Web & DevOps": ["FastAPI", "Docker Containerization"]
}

const JobSidebar = ({ job, onClose, onStatusChange, onNext, onPrev, hasNext, hasPrev }) => {
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
        if (!data) return { location: job.Location || '', tech_stack: {}, suggested_tech_stack: {}, points: [], ats_score: 'N/A' }

        // Handle ATS score (old: ai_ats_score, new: ats_score)
        const atsScore = data.ats_score || data.ai_ats_score || 'N/A'

        // Handle location
        let location = data.location || job.Location || ''
        if (location && !location.toLowerCase().includes('relocate')) {
            location += ' (Open to Relocate)'
        }

        // Handle tech stack
        let techStack = data.tech_stack || {}
        let suggestedTechStack = data.suggested_tech_stack || {}

        // Smart Stack Initialization (consistent with edit mode)
        if (Object.keys(suggestedTechStack).length === 0) {
            if (Object.keys(techStack).length > 0) {
                suggestedTechStack = { ...techStack }
            }
            techStack = JSON.parse(JSON.stringify(FIXED_TECH_STACK_CONST))
        }

        // Handle points (old: suggested_resume_point_1/2, new: points array)
        let points = []
        if (data.points && Array.isArray(data.points)) {
            points = data.points
        } else {
            // Convert old format
            if (data.suggested_resume_point_1) points.push(data.suggested_resume_point_1)
            if (data.suggested_resume_point_2) points.push(data.suggested_resume_point_2)
        }

        return { location, tech_stack: techStack, suggested_tech_stack: suggestedTechStack, points, ats_score: atsScore }
    }

    const normalizedData = normalizeData(analysisData)

    // Initialize editedData when job changes
    useEffect(() => {
        // Reset PDF state on new job
        setPdfUrl(null)
        setGenerateError('')
        setSaveMessage('')

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
            if (!data) return { location: job.Location || '', tech_stack: {}, suggested_tech_stack: {}, points: [], ats_score: 'N/A' }
            const atsScore = data.ats_score || data.ai_ats_score || 'N/A'
            let location = data.location || job.Location || ''
            if (location && !location.toLowerCase().includes('relocate')) {
                location += ' (Open to Relocate)'
            }
            let techStack = data.tech_stack || {}
            let suggestedTechStack = data.suggested_tech_stack || {}
            let points = []
            if (data.points && Array.isArray(data.points)) {
                points = data.points
            } else {
                if (data.suggested_resume_point_1) points.push(data.suggested_resume_point_1)
                if (data.suggested_resume_point_2) points.push(data.suggested_resume_point_2)
            }

            // Smart Stack Initialization:
            // If suggested_tech_stack is empty, this is either fresh data or a job without analysis
            // - If tech_stack has items (from scraper), move it to suggested (Blue)
            // - Always start user's stack (Green) with FIXED_TECH_STACK_CONST
            if (Object.keys(suggestedTechStack).length === 0) {
                // If there's tech_stack from analysis, use it as suggestions
                if (Object.keys(techStack).length > 0) {
                    suggestedTechStack = { ...techStack }
                }
                // Always initialize user's stack with their fixed skills
                techStack = JSON.parse(JSON.stringify(FIXED_TECH_STACK_CONST))
            }

            return { location, tech_stack: techStack, suggested_tech_stack: suggestedTechStack, points, ats_score: atsScore }
        }

        const data = normalize(jobAnalysisData)
        setEditedData(data)
        // Store original suggested stack in separate state or keep in originalData
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
        setJsonMode(false) // Reset JSON mode
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
        setJsonMode(false)
        setSaveMessage('')
        setJsonError('')
    }

    const handleJsonToggle = () => {
        if (!jsonMode) {
            // Enter JSON mode: Serialize current edited data
            setJsonText(JSON.stringify(editedData, null, 2))
            setJsonError('')
        } else {
            // Exit JSON mode: Parse back to object
            try {
                const parsed = JSON.parse(jsonText)
                setEditedData(parsed)
                setJsonError('')
            } catch (e) {
                setJsonError('Invalid JSON: ' + e.message)
                return // Prevent toggle if invalid
            }
        }
        setJsonMode(!jsonMode)
    }

    const handleSave = async () => {
        let dataToSave = editedData

        // If in JSON mode, try to parse first
        if (jsonMode) {
            try {
                dataToSave = JSON.parse(jsonText)
                setEditedData(dataToSave) // Sync back to state
                setJsonError('')
            } catch (e) {
                setJsonError('Cannot Save: Invalid JSON')
                return
            }
        }

        setSaving(true)
        setSaveMessage('')

        try {
            // Get the row index from job data
            const rowIndex = job._rowIndex || 0

            const response = await fetch('http://localhost:5001/api/update-analysis', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    row_index: rowIndex,
                    location: dataToSave.location,
                    tech_stack: dataToSave.tech_stack,
                    suggested_tech_stack: dataToSave.suggested_tech_stack,
                    points: dataToSave.points
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

            const response = await fetch('http://localhost:5001/api/generate-resume', {
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
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <h2 className="sidebar-title">{job.Title}</h2>
                                <div className="nav-buttons">
                                    <button
                                        onClick={onPrev}
                                        disabled={!hasPrev}
                                        style={{ opacity: hasPrev ? 1 : 0.3, cursor: hasPrev ? 'pointer' : 'default', border: 'none', background: 'none', fontSize: '1.2rem' }}
                                        title="Previous Job"
                                    >
                                        ⬅️
                                    </button>
                                    <button
                                        onClick={onNext}
                                        disabled={!hasNext}
                                        style={{ opacity: hasNext ? 1 : 0.3, cursor: hasNext ? 'pointer' : 'default', border: 'none', background: 'none', fontSize: '1.2rem' }}
                                        title="Next Job"
                                    >
                                        ➡️
                                    </button>
                                </div>
                            </div>

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

                        {/* Status Dropdown */}
                        <div className="sidebar-status-section">
                            <label className="sidebar-label">Application Status</label>
                            <select
                                value={job.Status || 'not_applied'}
                                onChange={(e) => onStatusChange(job, e.target.value)}
                                className="sidebar-status-select"
                            >
                                <option value="not_applied">❌ Not Applied</option>
                                <option value="applied">✅ Applied</option>
                                <option value="interviewing">💬 Interviewing</option>
                                <option value="accepted">🎉 Accepted</option>
                            </select>
                        </div>

                        {/* Link Button */}
                        <div style={{ marginBottom: '20px' }}>
                            <a href={job.Link} target="_blank" rel="noopener noreferrer"
                                style={{
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '8px',
                                    background: '#3182ce',
                                    color: 'white',
                                    padding: '8px 16px',
                                    borderRadius: '6px',
                                    textDecoration: 'none',
                                    fontWeight: '500',
                                    fontSize: '0.9rem'
                                }}>
                                View Job Posting ↗
                            </a>
                        </div>

                        {/* Job Description Section */}
                        <div className="detail-section">
                            <div className="section-header" onClick={() => toggleSection('jobDescription')}>
                                <h3>Job Description</h3>
                                <span className={`arrow ${expandedSections.jobDescription ? 'expanded' : ''}`}>▼</span>
                            </div>
                            <div className={`section-content ${expandedSections.jobDescription ? 'expanded' : ''}`}>
                                <div style={{
                                    whiteSpace: 'pre-wrap',
                                    fontSize: '0.85rem',
                                    color: '#4a5568',
                                    maxHeight: '400px',
                                    overflowY: 'auto',
                                    background: '#f7fafc',
                                    padding: '12px',
                                    borderRadius: '8px',
                                    border: '1px solid #edf2f7'
                                }}>
                                    {job['Job Description'] || "No description available."}
                                </div>
                            </div>
                        </div>



                        {/* JSON Editor Mode */}
                        {editMode && jsonMode && (
                            <div className="json-editor-container" style={{ marginTop: '20px' }}>
                                <div style={{ marginBottom: '8px', fontSize: '0.85rem', color: '#718096' }}>
                                    Directly edit the raw JSON data. Be careful with brackets!
                                </div>
                                <textarea
                                    className="json-textarea"
                                    value={jsonText}
                                    onChange={(e) => setJsonText(e.target.value)}
                                    style={{
                                        width: '100%',
                                        height: '400px',
                                        fontFamily: 'monospace',
                                        fontSize: '0.9rem',
                                        padding: '12px',
                                        borderRadius: '8px',
                                        border: '1px solid #e2e8f0',
                                        background: '#2d3748',
                                        color: '#e2e8f0',
                                        resize: 'vertical'
                                    }}
                                />
                                {jsonError && (
                                    <div style={{ color: '#e53e3e', fontSize: '0.85rem', marginTop: '8px', fontWeight: 'bold' }}>
                                        ⚠️ {jsonError}
                                    </div>
                                )}
                            </div>
                        )}

                        {/* Standard Sections (Hide in JSON Mode) */}
                        {(!editMode || !jsonMode) && (
                            <>
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
                                            <div className="tech-stack-merger">
                                                {/* Intro Text */}
                                                <div style={{ marginBottom: '16px', fontSize: '0.9rem', color: '#666' }}>
                                                    Select skills from <strong>Suggested</strong> (Blue) to add to <strong>Your Stack</strong> (Green).
                                                </div>

                                                {/* Compute Union of Categories to ensure we show everything */}
                                                {(() => {
                                                    const myCategories = Object.keys(editedData.tech_stack || {})
                                                    const suggestedCategories = originalData && originalData.suggested_tech_stack ? Object.keys(originalData.suggested_tech_stack) : []
                                                    const allCategories = [...new Set([...myCategories, ...suggestedCategories])]

                                                    return allCategories.map(category => {
                                                        const finalSkills = (editedData.tech_stack && editedData.tech_stack[category]) || []
                                                        const suggestedSkills = originalData && originalData.suggested_tech_stack ? (originalData.suggested_tech_stack[category] || []) : []

                                                        // Skip if both are empty (rare)
                                                        if (finalSkills.length === 0 && suggestedSkills.length === 0) return null


                                                        // Provide function to add manual skill
                                                        const handleManualAdd = (e) => {
                                                            if (e.key === 'Enter') {
                                                                const val = e.target.value.trim()
                                                                if (val && !finalSkills.includes(val)) {
                                                                    const newSkills = [...finalSkills, val]
                                                                    setEditedData(prev => ({
                                                                        ...prev,
                                                                        tech_stack: { ...prev.tech_stack, [category]: newSkills }
                                                                    }))
                                                                    e.target.value = ''
                                                                }
                                                            }
                                                        }

                                                        return (
                                                            <div key={category} className="merge-category-block" style={{ marginBottom: '24px', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '16px' }}>
                                                                <h4 style={{ margin: '0 0 12px 0', fontSize: '1rem', color: '#2d3748' }}>{category}</h4>

                                                                {/* Suggested (Source) */}
                                                                <div className="merge-row" style={{ marginBottom: '12px' }}>
                                                                    <div style={{ fontSize: '0.8rem', textTransform: 'uppercase', color: '#4299e1', fontWeight: 'bold', marginBottom: '6px' }}>Suggested</div>
                                                                    <div className="tech-skills">
                                                                        {suggestedSkills.length > 0 ? suggestedSkills.map(skill => {
                                                                            const isAdded = finalSkills.includes(skill)
                                                                            return (
                                                                                <button
                                                                                    key={skill}
                                                                                    className={`skill-chip suggested ${isAdded ? 'added' : ''}`}
                                                                                    disabled={isAdded}
                                                                                    onClick={() => {
                                                                                        if (!isAdded) {
                                                                                            const newSkills = [...finalSkills, skill]
                                                                                            setEditedData(prev => ({
                                                                                                ...prev,
                                                                                                tech_stack: { ...prev.tech_stack, [category]: newSkills }
                                                                                            }))
                                                                                        }
                                                                                    }}
                                                                                    style={{
                                                                                        background: isAdded ? '#edf2f7' : '#ebf8ff',
                                                                                        color: isAdded ? '#a0aec0' : '#2b6cb0',
                                                                                        border: isAdded ? '1px solid #e2e8f0' : '1px solid #bee3f8',
                                                                                        borderRadius: '20px',
                                                                                        padding: '4px 10px',
                                                                                        fontSize: '0.85rem',
                                                                                        cursor: isAdded ? 'default' : 'pointer',
                                                                                        marginRight: '6px',
                                                                                        marginBottom: '6px',
                                                                                        opacity: isAdded ? 0.7 : 1
                                                                                    }}
                                                                                >
                                                                                    {skill} {isAdded ? '✓' : <span style={{ fontWeight: 'bold' }}>+</span>}
                                                                                </button>
                                                                            )
                                                                        }) : <span style={{ color: '#a0aec0', fontStyle: 'italic', fontSize: '0.85rem' }}>None available</span>}
                                                                    </div>
                                                                </div>

                                                                {/* Final (Target) */}
                                                                <div className="merge-row">
                                                                    <div style={{ fontSize: '0.8rem', textTransform: 'uppercase', color: '#48bb78', fontWeight: 'bold', marginBottom: '6px' }}>Yours (Final)</div>
                                                                    <div className="tech-skills">
                                                                        {finalSkills.map(skill => (
                                                                            <button
                                                                                key={skill}
                                                                                className="skill-chip final"
                                                                                onClick={() => {
                                                                                    const newSkills = finalSkills.filter(s => s !== skill)
                                                                                    setEditedData(prev => ({
                                                                                        ...prev,
                                                                                        tech_stack: { ...prev.tech_stack, [category]: newSkills }
                                                                                    }))
                                                                                }}
                                                                                style={{
                                                                                    background: '#f0fff4',
                                                                                    color: '#2f855a',
                                                                                    border: '1px solid #c6f6d5',
                                                                                    borderRadius: '20px',
                                                                                    padding: '4px 10px',
                                                                                    fontSize: '0.85rem',
                                                                                    cursor: 'pointer',
                                                                                    marginRight: '6px',
                                                                                    marginBottom: '6px'
                                                                                }}
                                                                            >
                                                                                {skill} <span style={{ fontWeight: 'bold' }}>×</span>
                                                                            </button>
                                                                        ))}

                                                                        {/* Manual Add Input */}
                                                                        <input
                                                                            type="text"
                                                                            placeholder="+ Add Custom"
                                                                            onKeyDown={handleManualAdd}
                                                                            style={{
                                                                                background: 'transparent',
                                                                                border: '1px dashed #cbd5e0',
                                                                                borderRadius: '16px',
                                                                                padding: '4px 10px',
                                                                                fontSize: '0.85rem',
                                                                                width: '100px',
                                                                                outline: 'none',
                                                                                color: '#4a5568'
                                                                            }}
                                                                        />
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        )
                                                    })
                                                })()}
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
                            </>
                        )}

                        {/* Action Buttons */}
                        <div className="sidebar-footer">
                            {editMode ? (
                                <>
                                    <div style={{ display: 'flex', gap: '8px', flex: 1 }}>
                                        <button
                                            onClick={handleJsonToggle}
                                            style={{
                                                background: jsonMode ? '#4a5568' : '#cbd5e0',
                                                color: jsonMode ? '#fff' : '#4a5568',
                                                border: 'none',
                                                borderRadius: '6px',
                                                padding: '8px 12px',
                                                cursor: 'pointer',
                                                fontSize: '0.9rem'
                                            }}
                                        >
                                            {jsonMode ? 'UI Mode' : '{ } JSON'}
                                        </button>
                                    </div>
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
                                    <a href={`http://localhost:5001${pdfUrl}`} target="_blank" rel="noopener noreferrer" className="download-btn">
                                        Download PDF
                                    </a>
                                    <button className="copy-path-btn" onClick={() => navigator.clipboard.writeText(pdfUrl)}>
                                        Copy Link
                                    </button>
                                </div>
                                <div className="pdf-preview" style={{ marginTop: '16px' }}>
                                    <iframe
                                        src={`http://localhost:5001${pdfUrl}`}
                                        width="100%"
                                        height="400px"
                                        style={{ border: '1px solid #e2e8f0', borderRadius: '8px' }}
                                        title="Resume Preview"
                                    />
                                </div>
                            </div>
                        )}

                        {/* Persisted Resumes Section */}
                        {(job['Resume Path'] || job.pdf_path) && !pdfUrl && (
                            <div className="pdf-success" style={{ marginTop: '20px', background: '#f0f9ff', borderColor: '#bee3f8' }}>
                                <p style={{ color: '#2b6cb0' }}>📄 Saved Resume Available</p>
                                <div className="pdf-actions">
                                    {/* We need to extract filename from path */}
                                    {(() => {
                                        const path = job['Resume Path'] || job.pdf_path || '';
                                        // Handle multiple paths if separated by semicolon
                                        const paths = path.split(';').map(p => p.trim()).filter(p => p);
                                        const latestPath = paths[0];
                                        const filename = latestPath.split('/').pop();

                                        return (
                                            <>
                                                <a href={`http://localhost:5001/api/download-resume/${filename}`} target="_blank" rel="noopener noreferrer" className="download-btn">
                                                    Download Latest PDF
                                                </a>
                                                <div style={{ fontSize: '0.8rem', color: '#718096', marginTop: '8px' }}>
                                                    {filename}
                                                </div>
                                            </>
                                        )
                                    })()}
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div >
        </>
    )
}

export default JobSidebar
