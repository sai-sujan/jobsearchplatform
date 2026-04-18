# Settings UI Guide

A comprehensive web interface for managing all configuration files without editing files directly.

## Overview

The Settings UI is integrated into the job tracker dashboard, allowing you to manage:

- **Job Configuration** - Search keywords, job filters, and limits
- **Environment Variables** - API keys, Chrome paths, and settings
- **Company Blacklist** - Companies/keywords to exclude
- **Your Skills** - Your technical skills and expertise
- **Master Resume** - Your resume content (plain text)

## Accessing Settings

1. **Start the dashboard:**
   ```bash
   npm run dev
   # or
   make dashboard
   ```

2. **Open in browser:**
   ```
   http://localhost:5173
   ```

3. **Click the Settings tab:**
   Look for the ⚙️ **Settings** button in the navigation bar

## Configuration Tabs

### 1. 📋 Job Config

**What it does:** Configure your job search parameters

**Fields:**
- `SEARCH_KEYWORDS` - Array of job titles/keywords to search for
- `MAX_JOBS` - Maximum number of jobs to collect
- `FILTERS` - Job filtering options
  - `level` - Entry level, mid, senior, etc.
  - `type` - Full-time, internship, contract, etc.
  - `remote` - true/false for remote positions
  - `posted_within_days` - Only jobs posted within N days

**Example:**
```json
{
  "SEARCH_KEYWORDS": ["machine learning engineer", "AI engineer", "data scientist"],
  "MAX_JOBS": 40,
  "FILTERS": {
    "level": "entry",
    "type": "internship",
    "remote": true,
    "posted_within_days": 1
  }
}
```

**Format:** Valid JSON (use Ctrl+Shift+F in most editors to format)

---

### 2. ⚡ Environment Variables

**What it does:** Configure API keys, paths, and system settings

**Common Variables:**
```env
# Chrome Configuration
CHROME_PATH=/Applications/Google Chrome.app/Contents/MacOS/Google Chrome
CHROME_PROFILE_PATH=/Users/yourusername/Library/Application Support/Google/Chrome/Default

# API Keys (choose one)
OPENAI_API_KEY=sk-your-key-here
# OR
AIRLLM_MODEL=google/gemma-2-2b-it

# Optional
ACTION_DELAY=2
MAX_RETRIES=3
```

**Finding Chrome Profile Path:**
1. Open Chrome → `chrome://version/`
2. Copy the "Profile Path" value

**Format:** One `KEY=VALUE` per line (lines starting with # are comments)

⚠️ **Security:** Sensitive data like API keys should be stored securely. Use environment variables when possible.

---

### 3. 🚫 Company Blacklist

**What it does:** Exclude staffing/consulting companies from results

**Example:**
```
staffing
consulting
recruiting
# Staffing agencies
robert half
kforce
heidrick & struggles

# Consulting firms
accenture
deloitte
mckinsey
```

**Format:** One company/keyword per line (lines starting with # are comments)

**Tips:**
- Use partial names that will match variations
- Case-insensitive matching
- Broader keywords catch more companies

---

### 4. 🎯 Your Skills

**What it does:** List your technical skills for job matching

**Example:**
```
Python
JavaScript
React
Machine Learning
TensorFlow
PyTorch
Data Analysis
PostgreSQL
AWS
Docker
```

**Format:** One skill per line

**Tips:**
- Include both broad and specific skills
- Add frameworks and technologies
- Include soft skills (communication, leadership, etc.)
- More comprehensive list = better matching

---

### 5. 📄 Resume

**What it does:** Your master resume in plain text format

**Content:**
- Your full name and contact info
- Professional summary
- Work experience (dates, company, role, achievements)
- Education
- Skills and certifications
- Projects (optional)

**Example:**
```
JOHN DOE
john@example.com | (555) 123-4567 | linkedin.com/in/johndoe

PROFESSIONAL SUMMARY
Software engineer with 5+ years experience in full-stack development...

EXPERIENCE
Senior Software Engineer - Tech Corp (2020-2024)
- Led team of 3 engineers on microservices migration
- Implemented CI/CD pipeline reducing deployment time by 60%
- Built Python/FastAPI backend for ML model serving

Software Engineer - StartupCo (2018-2020)
- Developed React frontend for SaaS platform
- Designed PostgreSQL database schema
- ...

EDUCATION
B.S. Computer Science - State University (2018)

SKILLS
Languages: Python, JavaScript, Go, SQL
Frameworks: React, FastAPI, Django, Node.js
Databases: PostgreSQL, MongoDB, Redis
Cloud: AWS, GCP, Docker, Kubernetes
```

**Format:** Plain text (no formatting/markdown)

**Tips:**
- Be specific about achievements and metrics
- Include relevant technologies and frameworks
- Tailor based on job descriptions (use AI tailoring feature)
- Keep format consistent and readable

---

## Workflow

### Basic Workflow

1. **Update Resume**
   - Navigate to Settings → Resume tab
   - Paste/edit your resume content
   - Click "Save Resume"
   - Use the tailoring feature in the job tracker for job-specific versions

2. **Configure Search**
   - Go to Settings → Job Config
   - Update `SEARCH_KEYWORDS` with roles you're targeting
   - Adjust filters (level, type, remote, recency)
   - Save

3. **Blacklist Unwanted Companies**
   - Go to Settings → Blacklist
   - Add staffing/consulting companies to exclude
   - Save (takes effect on next search)

4. **Set Environment Variables**
   - Go to Settings → Environment
   - Add/update Chrome paths and API keys
   - **Never commit secrets to git**

### Multi-Role Workflow

If searching multiple job titles:

1. Run automation with multiple `SEARCH_KEYWORDS`
2. Check results in the job tracker
3. Use the dashboard to review and apply

### Tailoring Workflow

1. View a job in the tracker
2. Use the "AI Tailor" feature to customize resume for that job
3. The tailored resume is saved in `data/resumes/`
4. Reference when applying

---

## Saving & Backup

### Auto-Save
- All changes are saved to the config files immediately
- No "save all" button needed - each tab saves independently

### Backup
- Excel job database auto-backs up before updates
- Check `data/backups/` for previous versions
- Use "Create Backup" in the job tracker to manually backup

### Git Safety
The settings files are configured to never expose:
- `.env` files (API keys)
- Browser cache (chrome_session*)
- Logs (logs/, *.log)
- User data (resumes, Excel files)

---

## Troubleshooting

### Settings not saving

1. **Check API is running:**
   ```bash
   python -m api.server
   ```
   Should see: `Uvicorn running on http://0.0.0.0:5001`

2. **Check for JSON errors** (in Job Config tab):
   - Must be valid JSON
   - Try formatting with an online JSON beautifier
   - Check for trailing commas

3. **Check permissions:**
   - Config files must be writable
   - Run: `chmod 644 config/*.json`

### API errors

If you see "Failed to load configuration":

1. Ensure API is running on port 5001
2. Check firewall isn't blocking localhost:5001
3. Clear browser cache (Ctrl+Shift+Delete)
4. Restart API server

### Changes not taking effect

Some settings require restarting the automation:
- `.env` variables (Chrome path, API keys)
- `SEARCH_KEYWORDS` (takes effect on next search)

Job filters take effect on next search.

---

## Advanced Usage

### Environment Variables

Full list of supported `.env` variables:

```env
# Chrome Configuration
CHROME_PATH=/path/to/chrome
CHROME_PROFILE_PATH=/path/to/profile

# API Configuration
OPENAI_API_KEY=sk-...          # For OpenAI
AIRLLM_MODEL=google/gemma-2-2b # For local LLM
GROQ_API_KEYS=gsk-...          # For Groq LLM

# Search Configuration
SEARCH_KEYWORDS=role1,role2,role3
MAX_JOBS_TO_COLLECT=40
TOP_JOBS_TO_KEEP=5

# Behavior
ACTION_DELAY=2                  # Seconds between actions
MAX_RETRIES=3
DEBUG=0                         # Set to 1 for debug logging

# API Configuration
API_HOST=localhost
API_PORT=5001
```

### JSON Configuration

The `job_config.json` supports:

```json
{
  "SEARCH_KEYWORDS": ["role1", "role2"],
  "MAX_JOBS": 40,
  "FILTERS": {
    "level": "entry",
    "type": "internship",
    "remote": true,
    "posted_within_days": 1
  },
  "SHEET_NAME": "Jobs",
  "EXCEL_COLUMNS": [...],
  "EVALUATION_MODEL": "openai"
}
```

---

## Examples

### Example: Internship Search

**Job Config:**
```json
{
  "SEARCH_KEYWORDS": ["software engineer internship", "ML engineer internship"],
  "MAX_JOBS": 50,
  "FILTERS": {
    "level": "entry",
    "type": "internship",
    "remote": true,
    "posted_within_days": 7
  }
}
```

**Blacklist:**
```
staffing
consulting
recruiter
robert half
kforce
```

---

### Example: Full-Time Search

**Job Config:**
```json
{
  "SEARCH_KEYWORDS": ["senior software engineer", "ML engineer", "AI engineer"],
  "MAX_JOBS": 100,
  "FILTERS": {
    "level": "senior",
    "type": "full-time",
    "remote": true,
    "posted_within_days": 30
  }
}
```

---

## Security Best Practices

1. **Never share API keys**
   - Store in `.env` only
   - `.gitignore` prevents accidental commits

2. **Browser security**
   - Use Settings UI only on private networks/machines
   - API runs on localhost by default

3. **File permissions**
   - Config files are readable/writable by user only
   - Never share config files with API keys

4. **Backup credentials**
   - Keep `.env` backup somewhere safe
   - Use password manager for API keys

---

## Support

- **Settings not saving?** → Check API is running (`python -m api.server`)
- **JSON errors?** → Use an online JSON validator to debug
- **Questions?** → See DEVELOPMENT.md for deeper config options

---

**Last Updated:** 2026-04-11
