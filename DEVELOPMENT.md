# Development Guide

## Project Overview

ClawdBot is a job search automation tool with three main components:

1. **Scraper**: LinkedIn job scraping with Playwright
2. **Evaluator**: Resume matching with AI (OpenAI or local models)
3. **Tracker**: Excel-based job database with Excel operations

## Architecture

```
Web/User Input
     │
     ▼
┌─────────────────────────────────────────┐
│   Entry Points (main.py, find_jobs.py)  │
└──────────────┬──────────────────────────┘
               │
     ┌─────────┴──────────┬──────────────┐
     ▼                    ▼              ▼
┌──────────────┐  ┌──────────────┐  ┌────────────┐
│ Job Scraper  │  │ Resume Eval  │  │ Output    │
│ (Playwright) │  │ (OpenAI/LLM) │  │ Writer    │
└──────┬───────┘  └──────┬───────┘  │ (Excel)   │
       │                 │          └─────┬──────┘
       └─────────┬───────┴────────────────┘
                 ▼
          ┌──────────────────┐
          │  Data Storage    │
          │  (jobs_master    │
          │   .xlsx)         │
          └──────────────────┘
```

## Key Modules

### `src/scraper/job_scraper.py`
- LinkedIn job searching with Playwright
- Handles Chrome automation and session management
- Extracts job listings with safe delays to avoid detection

**Key Classes:**
- `JobScraper` - Main scraping orchestrator
- `JobListing` - Data model for job info

### `src/evaluation/`
Resume evaluation engines and scoring:

- `resume_evaluator.py` - AI-powered resume matching
- `ats_scorer.py` - ATS score calculation
- `simple_evaluator.py` - Lightweight alternative
- `skill_matcher.py` - Skill extraction and matching
- `tailor_service.py` - Resume customization

### `src/data/output_writer.py`
- Excel file management
- Backup creation
- Data serialization

### `src/settings.py`
Centralized configuration management. All settings should go through this module.

## Development Workflow

### 1. Setup Development Environment

```bash
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
pip install -r requirements-dev.txt  # for testing/linting
```

### 2. Environment Variables

Copy `.env.example` to `.env` and fill in required values:

```bash
cp .env.example .env
```

Required:
- `CHROME_PATH` - Path to Chrome browser
- `CHROME_PROFILE_PATH` - Chrome user profile
- Either `OPENAI_API_KEY` or `AIRLLM_MODEL`

### 3. Running Locally

```bash
# Run full workflow
python main.py

# With debug logging
DEBUG=1 python main.py

# Run tests
pytest

# Run specific test
pytest tests/test_scraper.py -v
```

### 4. Code Organization

```
src/
├── scraper/          # Web scraping logic
├── evaluation/       # Resume evaluation logic
├── data/            # Data persistence
├── resume/          # Resume generation
├── utils/           # Shared utilities
└── settings.py      # Configuration
```

**New features should:**
1. Go in the appropriate `src/` module
2. Use `src/settings.py` for configuration
3. Have unit tests in `tests/`
4. Update documentation

### 5. Adding a New Feature

Example: Adding a new resume evaluator

```python
# src/evaluation/new_evaluator.py
class NewEvaluator:
    """New evaluation strategy."""
    
    def __init__(self, resume_path):
        self.resume = self._load_resume(resume_path)
    
    def evaluate(self, job_description):
        """Score job match."""
        score = self._calculate_match(job_description)
        return score

# Update src/settings.py to support new strategy
EVALUATOR_TYPE = "new"  # or "openai", "airllm", "simple"
```

### 6. Testing

```bash
# Run all tests
pytest

# Run with coverage
pytest --cov=src tests/

# Run specific test class
pytest tests/test_scraper.py::TestJobScraper -v

# Run with debug output
pytest -s tests/test_scraper.py
```

Test files should be in `tests/` directory mirroring `src/`:

```
tests/
├── test_scraper.py
├── test_evaluator.py
├── test_output_writer.py
└── fixtures/         # Test data
```

### 7. Code Style

```bash
# Format code
black src/ tests/

# Lint
flake8 src/ tests/

# Type checking
mypy src/
```

Targets:
- PEP 8 compliance
- Type hints where helpful
- Clear, documented code

### 8. Debugging

Enable debug logging:

```python
import logging
logging.basicConfig(level=logging.DEBUG)
```

Or use environment variable:

```bash
DEBUG=1 python main.py
```

Check logs in `logs/` directory.

## Script Development

Utility scripts in `scripts/` should:

1. **Import from `src/`**, not duplicate code
2. **Handle errors gracefully** with clear messages
3. **Document purpose** at the top
4. **Be placed in appropriate subdirectory**:
   - `maintenance/` - Data cleanup/updates
   - `analysis/` - Analytics/reporting
   - `utilities/` - General helpers
   - `dev/` - Testing/debugging

Example script:

```python
#!/usr/bin/env python3
"""
Update all job scores with latest resume.
Usage: python scripts/maintenance/rescore_jobs.py
"""

import sys
from pathlib import Path

# Add parent to path for imports
sys.path.insert(0, str(Path(__file__).parent.parent.parent))

from src.settings import settings
from src.data.output_writer import OutputWriter
from src.evaluation.ats_scorer import ATSScorer

def main():
    """Main entry point."""
    writer = OutputWriter()
    scorer = ATSScorer()
    
    # Your logic here
    pass

if __name__ == "__main__":
    main()
```

## Common Tasks

### Updating Configuration

Edit `src/settings.py` for programmatic defaults:

```python
# src/settings.py
SEARCH_KEYWORDS = os.getenv('SEARCH_KEYWORDS', 'machine learning').split(',')
MAX_JOBS = int(os.getenv('MAX_JOBS', '40'))
```

Users can override via `.env`:

```
SEARCH_KEYWORDS=machine learning,AI engineer,data scientist
MAX_JOBS=50
```

### Adding a Maintenance Script

1. Create in `scripts/maintenance/`
2. Import from `src/`
3. Handle Excel backups
4. Add documentation at top

### Database Schema Changes

When updating `jobs_master.xlsx` columns:

1. Update `src/data/output_writer.py`
2. Add migration script in `scripts/maintenance/`
3. Document in `data/` column mapping

## Debugging Chrome Issues

If LinkedIn scraping fails:

1. **Check Chrome process**: `ps aux | grep Chrome`
2. **Profile locked**: Kill all Chrome: `pkill -f "Google Chrome"`
3. **Session invalid**: Log in to LinkedIn manually and close Chrome
4. **HTML changed**: Check `logs/scraper.log` for parsing errors

Debug Playwright:

```python
from src.scraper.job_scraper import JobScraper

scraper = JobScraper(headless=False)  # Show browser
scraper.search(keyword="machine learning")
```

## Performance Tips

1. **Batch operations**: Use `find_jobs.py` for incremental updates
2. **Caching**: Resume evaluation cache to avoid re-scoring
3. **Parallelization**: Multiple Chrome instances for batch runs
4. **Rate limiting**: Adjust `ACTION_DELAY` if needed

## Documentation Standards

- **Code**: Docstrings for all classes/functions
- **Modules**: Module-level docstring at top
- **Scripts**: Purpose comment at beginning
- **README**: Keep main README concise, details in PROJECT_STRUCTURE.md

Example:

```python
def evaluate_job(job_description: str, resume: str) -> float:
    """
    Evaluate job match against resume.
    
    Args:
        job_description: Full job posting text
        resume: Candidate resume text
    
    Returns:
        ATS score 0-100
    
    Raises:
        ValueError: If inputs are empty
    """
    pass
```

## Deployment

### Local Scheduler

Use `scheduler.py` for recurring runs:

```bash
python scheduler.py
```

Configuration in `.env`:

```
SCHEDULE_ENABLED=true
SCHEDULE_INTERVAL=24h  # daily
```

### Dashboard Deployment

```bash
cd dashboard
npm run build
# Serve dist/ folder
```

## Support

- Check `logs/` for error details
- Review `PROJECT_STRUCTURE.md` for architecture
- See `src/settings.py` for all configuration options

---

**Last Updated:** 2026-04-11
