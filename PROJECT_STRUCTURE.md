# Project Structure

## Overview
ClawdBot is an automation framework for job application workflows. It scrapes job listings, evaluates them against your resume, and maintains a master database of applications.

## Directory Organization

```
job-applications/
├── main.py                    # Primary entry point - full workflow
├── find_jobs.py              # Simplified job finding (uses master Excel)
├── run_automation.py         # Batch orchestrator (runs multiple searches)
├── scheduler.py              # LaunchAgent/scheduled tasks
├── requirements.txt          # Python dependencies
├── setup.sh                  # Initial environment setup
│
├── src/                      # Core application code
│   ├── __init__.py
│   ├── settings.py          # Configuration management
│   ├── utils/               # Shared utilities
│   ├── scraper/             # LinkedIn scraping
│   │   └── job_scraper.py
│   ├── evaluation/          # Resume evaluation & scoring
│   │   ├── resume_evaluator.py
│   │   ├── ats_scorer.py
│   │   ├── simple_evaluator.py
│   │   ├── skill_matcher.py
│   │   └── tailor_service.py
│   ├── data/                # Data persistence
│   │   └── output_writer.py
│   └── resume/              # Resume generation
│       └── single_generator.py
│
├── scripts/                 # Utility scripts (organized by purpose)
│   ├── maintenance/         # Data cleanup & Excel operations
│   │   ├── clean_master_excel.py
│   │   ├── clean_recent_run.py
│   │   ├── process_jobs.py
│   │   ├── rescore_jobs.py
│   │   ├── run_ai_evaluation.py
│   │   ├── mark_applied.py
│   │   └── retroactive_tailor.py
│   ├── analysis/            # Analytics & reporting
│   │   ├── analyze_batch.py
│   │   ├── analyze_resume_rows.py
│   │   └── update_excel_analysis.py
│   ├── dev/                 # Development & testing utilities
│   │   ├── test_location.py
│   │   ├── dump_batch1.py
│   │   ├── dump_batch_generic.py
│   │   └── find_jds_from_excel*.py
│   └── utilities/           # General helpers
│       ├── check_columns.py
│       ├── login_helper.py
│       ├── mass_update_tech_stack.py
│       └── update_excel_with_json_paths.py
│
├── config/                  # Configuration files
│   ├── default_tech_stack.json
│   ├── default_stack.json
│   ├── job_config.json
│   ├── your_skills.txt
│   ├── common_skills.txt
│   └── company_blacklist.txt
│
├── data/                    # Data storage (git-ignored, user-specific)
│   ├── jobs_master.xlsx     # Master job database
│   ├── processed_jobs_history.json
│   ├── job_descriptions/    # Saved job postings
│   ├── resumes/             # Generated resumes
│   ├── backups/             # Excel backups
│   └── analysis_results/    # Analysis outputs
│
├── resume/                  # Resume templates & content
│   └── master_resume.txt
│
├── templates/               # Document templates
│   └── overleaf.txt
│
├── dashboard/               # Web dashboard (React/Vite)
│   ├── src/
│   ├── package.json
│   ├── vite.config.js
│   └── dist/                # Built assets
│
├── api/                     # Backend API server
│   └── server.py
│
├── docs/                    # Documentation
│   ├── README.md
│   ├── TRACKER_GUIDE.md
│   ├── SCHEDULER_GUIDE.md
│   ├── DASHBOARD_README.md
│   └── LAUNCHAGENT_QUICKREF.md
│
├── .env                     # Environment variables (git-ignored)
├── .env.example             # Example configuration
├── .gitignore               # Git ignore rules
└── README.md                # Main documentation
```

## Entry Points

### 1. **main.py** (Primary)
Full end-to-end job search and evaluation workflow.

```bash
python main.py                  # Run with defaults
python main.py /search_jobs     # Explicit command
```

**What it does:**
- Opens Chrome with LinkedIn session
- Searches for jobs based on configuration
- Filters and scrapes job descriptions
- Evaluates resume against each job
- Scores and ranks results
- Saves to master Excel file

**When to use:** Full automated job search

---

### 2. **find_jobs.py** (Simplified)
Lightweight job finder that appends directly to `data/jobs_master.xlsx`.

```bash
python find_jobs.py
```

**What it does:**
- Finds new jobs without re-running full evaluation
- Uses file locking for safety
- Creates automatic backups before writes
- Faster than main.py for incremental updates

**When to use:** Quick job discovery without full re-evaluation

---

### 3. **run_automation.py** (Batch Orchestrator)
Runs multiple search batches in sequence with clean environments.

```bash
python run_automation.py
```

**What it does:**
- Runs each batch from `SEARCH_QUERIES` config
- Spawns main.py as subprocess for each batch
- Ensures clean memory/event loop between runs
- Orchestrates multi-role job searches

**When to use:** Searching multiple job titles/keywords in one session

---

### 4. **scheduler.py** (Scheduled Automation)
Runs automation on a schedule (launchd/systemd compatible).

```bash
python scheduler.py
```

**Configuration via `settings.py`:**
- `SCHEDULE_INTERVAL`: How often to run
- `SCHEDULE_ENABLED`: Enable/disable scheduling

**When to use:** Automated daily/weekly job searches

---

## Key Scripts

### Maintenance Scripts (`scripts/maintenance/`)
Use these to manage your job database:

| Script | Purpose |
|--------|---------|
| `process_jobs.py` | Process and update job evaluations |
| `rescore_jobs.py` | Re-score all jobs with current resume |
| `run_ai_evaluation.py` | Run AI evaluation on unevaluated jobs |
| `mark_applied.py` | Mark jobs as applied/rejected |
| `clean_master_excel.py` | Remove duplicates and invalid entries |
| `clean_recent_run.py` | Clean up artifacts from last run |
| `retroactive_tailor.py` | Apply tailoring to existing resume points |

### Analysis Scripts (`scripts/analysis/`)
Generate insights from your job search data:

| Script | Purpose |
|--------|---------|
| `analyze_batch.py` | Analyze a batch of jobs |
| `analyze_resume_rows.py` | Analyze resume point effectiveness |
| `update_excel_analysis.py` | Update Excel with latest analysis |

### Development Scripts (`scripts/dev/`)
Utilities for development and debugging:

| Script | Purpose |
|--------|---------|
| `test_location.py` | Test location-based filtering |
| `dump_batch*.py` | Debug batch processing |
| `find_jds_from_excel*.py` | Extract job descriptions from Excel |

---

## Configuration

### `config/job_config.json`
Main job search configuration.

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

### `config/company_blacklist.txt`
Companies to exclude from results:

```
staffing
consulting
recruiting
```

### `resume/master_resume.txt`
Your plain-text resume content. Update this to customize evaluations.

---

## Data Files

### `data/jobs_master.xlsx`
Master job database with columns:
- Company, Title, Link
- Posting Date, Role Type
- ATS Score, Missing Skills
- Resume Strengths, Gaps
- Sponsorship Info
- Application Status

### `data/job_descriptions/`
Backup copies of job postings for reference.

### `data/backups/`
Automatic Excel backups before each write.

---

## Workflow

```
┌─────────────────────────────────────────────────────────────┐
│  Entry Point Selection                                      │
│  - main.py (full workflow)                                  │
│  - find_jobs.py (quick discovery)                           │
│  - run_automation.py (batch processing)                     │
│  - scheduler.py (recurring)                                 │
└────────────────┬────────────────────────────────────────────┘
                 │
                 ▼
        ┌────────────────────┐
        │  LinkedIn Scraping │ (job_scraper.py)
        │  - Open Chrome     │
        │  - Search jobs     │
        │  - Extract details │
        └────────┬───────────┘
                 │
                 ▼
        ┌────────────────────┐
        │  Company Filtering │
        │  - Blacklist check │
        │  - Remove staffing │
        └────────┬───────────┘
                 │
                 ▼
        ┌────────────────────┐
        │ Resume Evaluation  │ (evaluation/*.py)
        │  - Load resume     │
        │  - Score job match │
        │  - Extract skills  │
        └────────┬───────────┘
                 │
                 ▼
        ┌────────────────────┐
        │ Ranking & Output   │ (output_writer.py)
        │  - Sort by score   │
        │  - Save Excel      │
        │  - Generate report │
        └────────────────────┘
```

---

## Development Guide

### Adding a New Script
1. Create script in appropriate `scripts/` subdirectory
2. Import from `src/` as needed
3. Document purpose in this file
4. Test with sample data

### Adding a New Feature
1. Extend appropriate module in `src/`
2. Update settings if needed
3. Update this documentation
4. Create utility script if it's user-facing

### Running Tests
```bash
# Run all tests
pytest

# Run specific test
pytest scripts/dev/test_location.py
```

---

## Notes

- **Chrome Profile**: Must be logged into LinkedIn and session must be active
- **API Keys**: Set in `.env` (see `.env.example`)
- **File Locking**: Scripts use lock files to prevent concurrent Excel writes
- **Backups**: Every Excel write creates a timestamped backup in `data/backups/`
- **Logs**: Check `logs/` directory for execution logs

---

Last Updated: 2026-04-11
