# Job Application Automation

Automate LinkedIn job searching, resume evaluation, and application tracking with AI-powered insights.

## Quick Start

### 1. Setup Environment

```bash
# Create & activate virtual environment
python3 -m venv venv
source venv/bin/activate  # macOS/Linux
# or .\venv\Scripts\activate  # Windows

# Install dependencies
pip install -r requirements.txt
playwright install chromium
```

### 2. Configure Settings

```bash
# Copy example configuration
cp .env.example .env

# Edit with your details
# - CHROME_PATH: Your Chrome browser path
# - CHROME_PROFILE_PATH: Your Chrome profile (see .env.example for help)
# - OPENAI_API_KEY or AIRLLM_MODEL: For resume evaluation
```

**Finding Chrome Profile Path:**
1. Open Chrome → `chrome://version/`
2. Copy the "Profile Path" value into `.env`

### 3. Update Resume

Replace `resume/master_resume.txt` with your actual resume (plain text format).

### 4. Run Job Search

```bash
python main.py
```

That's it! Results are saved to `data/jobs_master.xlsx`.

---

## Usage

### Entry Points

| Command | Use Case |
|---------|----------|
| `python main.py` | Full job search & evaluation (recommended) |
| `python find_jobs.py` | Quick discovery without full re-evaluation |
| `python run_automation.py` | Search multiple roles in one session |
| `python scheduler.py` | Automated daily/weekly searches |

### Common Tasks

```bash
# Re-evaluate all jobs with current resume
python scripts/maintenance/rescore_jobs.py

# Mark jobs as applied
python scripts/maintenance/mark_applied.py

# Clean & deduplicate master Excel
python scripts/maintenance/clean_master_excel.py

# Analyze job match patterns
python scripts/analysis/analyze_batch.py
```

See [PROJECT_STRUCTURE.md](PROJECT_STRUCTURE.md) for all available scripts.

---

## Configuration

### Job Search (`config/job_config.json`)

```json
{
  "SEARCH_KEYWORDS": ["machine learning", "AI engineer"],
  "MAX_JOBS": 40,
  "FILTERS": {
    "level": "entry",
    "type": "internship",
    "remote": true,
    "posted_within_days": 1
  }
}
```

### Company Blacklist (`config/company_blacklist.txt`)

Add staffing/consulting companies to exclude:

```
staffing
consulting
recruiting
```

### More Settings

Edit `src/settings.py` for advanced configuration:
- Resume tailoring options
- AI model selection
- Output formatting
- Retry policies

---

## Output

The automation generates:

- **`data/jobs_master.xlsx`** - Master job database with:
  - Company name, job title, application link
  - ATS match score (0-100)
  - Missing core skills & frameworks
  - Resume strengths & gaps
  - Visa sponsorship info
  - Application status

- **`data/job_descriptions/`** - Saved job postings for reference

- **`data/backups/`** - Automatic backups before each Excel write

---

## Dashboard

Optional web dashboard for tracking applications:

```bash
cd dashboard
npm install
npm run dev
```

Visit `http://localhost:5173` to view your job search progress.

---

## Troubleshooting

### "Not logged into LinkedIn"
1. Open Chrome normally, log into LinkedIn
2. Close Chrome completely
3. Run the automation again

### "Chrome profile locked"
```bash
# Kill Chrome processes
pkill -f "Google Chrome"
```

### "No jobs found"
1. Check job_config.json search keywords
2. Try different search terms
3. LinkedIn HTML structure may have changed (check logs/)

### "OpenAI/API errors"
1. Verify API key in .env
2. Check account has credits
3. Try `gpt-3.5-turbo` as fallback

---

## Project Structure

```
job-applications/
├── main.py                 # Primary entry point
├── src/                    # Core application code
├── scripts/                # Utility scripts
│   ├── maintenance/        # Data cleanup
│   ├── analysis/           # Analytics
│   ├── dev/                # Development utilities
│   └── utilities/          # General helpers
├── config/                 # Configuration files
├── data/                   # Job database & results
├── dashboard/              # Web UI (React)
└── docs/                   # Documentation
```

See [PROJECT_STRUCTURE.md](PROJECT_STRUCTURE.md) for detailed organization and all available scripts.

---

## Costs & Limits

- **OpenAI API**: ~$1-3 per 40 jobs (GPT-4)
- **LinkedIn Rate Limits**: Built-in delays between actions
- **Visa Sponsorship**: Extracted from job descriptions without hallucination

---

## Important Notes

- **Chrome Session**: Must be logged in before running
- **File Locking**: Prevents concurrent writes to Excel
- **Automatic Backups**: Every write creates a timestamped backup
- **Logs**: Check `logs/` for detailed execution logs

---

## Support

- Check `logs/` for error details
- Review [PROJECT_STRUCTURE.md](PROJECT_STRUCTURE.md) for available scripts
- See `docs/` for detailed guides

---

## License

MIT - Use for personal job search assistance only.

---

**Last Updated:** 2026-04-11 | Version: 2.0 (Production Ready)
