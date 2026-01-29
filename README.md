# Job Applications Automation

Automate LinkedIn job searching and resume evaluation using Playwright and OpenAI.

## Features

- **LinkedIn Job Scraping**: Opens your Chrome browser (with LinkedIn logged in) and collects job listings
- **Smart Filtering**: Automatically filters out staffing/consulting companies using a customizable blacklist
- **AI Resume Evaluation**: Uses OpenAI to evaluate your resume against each job description
- **ATS Analysis**: Provides detailed keyword matching, missing skills, and improvement suggestions
- **Visa Sponsorship Detection**: Extracts sponsorship information from job descriptions (without hallucination)
- **Excel Output**: Saves top 5 ranked jobs to a formatted Excel file

## Quick Start

### 1. Setup Environment

```bash
# Navigate to project directory
cd job-applications

# Create virtual environment
python3 -m venv venv

# Activate virtual environment
source venv/bin/activate  # macOS/Linux
# or
.\venv\Scripts\activate  # Windows

# Install dependencies
pip install -r requirements.txt

# Install Playwright browsers
playwright install chromium
```

### 2. Configure Environment

```bash
# Copy example configuration
cp .env.example .env

# Edit .env with your settings
```

Required settings in `.env`:

```env
CHROME_PATH=/Applications/Google Chrome.app/Contents/MacOS/Google Chrome
CHROME_PROFILE_PATH=/Users/yourusername/Library/Application Support/Google/Chrome/Default
OPENAI_API_KEY=sk-your-api-key-here
```

**Finding your Chrome Profile Path:**
1. Open Chrome
2. Navigate to `chrome://version/`
3. Copy the "Profile Path" value

### 3. Update Your Resume

Replace the content in `resume/master_resume.txt` with your actual resume in plain text format.

### 4. Run the Automation

```bash
python main.py
```

Or explicitly run the search command:

```bash
python main.py /search_jobs
```

## Commands

| Command | Description |
|---------|-------------|
| `/search_jobs` | Run full job search and evaluation workflow |
| `/help` | Show help information |
| `/status` | Check configuration status |

## Workflow

1. **Job Collection**: Opens Chrome with your LinkedIn session and searches for ML/AI jobs
2. **Filtering**: Applies filters (Entry-level, Internship, Remote, Past 24 hours) and removes blacklisted companies
3. **Description Extraction**: Navigates to each job and extracts the full description
4. **AI Evaluation**: Uses OpenAI to analyze your resume against each job
5. **Ranking**: Ranks jobs by ATS score and relevance
6. **Output**: Saves top 5 jobs to Excel with detailed analysis

## Output

The automation generates:

- `outputs/job_evaluations.xlsx` - Excel file with:
  - Company Name, Job Title, Job Link
  - Posting Date, Role Type
  - ATS Score (0-100)
  - Missing Core Skills, Tools/Frameworks, ML/AI Concepts
  - Resume Strengths
  - Gaps & Improvements
  - Suggested Resume Points (ATS-friendly)
  - Recruiter Verdict
  - Sponsorship Possible (Yes/No/Unknown)
  - Sponsorship Evidence

- `job_descriptions/` - Saved job descriptions for reference

## Customization

### Search Keywords

Edit `SEARCH_KEYWORDS` in `.env`:

```env
SEARCH_KEYWORDS=machine learning engineer,AI engineer,data scientist
```

### Company Blacklist

Edit `config/company_blacklist.txt` to add/remove staffing companies:

```
staffing
consulting
# Add more keywords...
```

### Number of Jobs

Adjust in `.env`:

```env
MAX_JOBS_TO_COLLECT=40
TOP_JOBS_TO_KEEP=5
```

## Project Structure

```
job-applications/
├── main.py                 # Entry point
├── requirements.txt        # Dependencies
├── .env                    # Configuration (create from .env.example)
├── .env.example            # Example configuration
├── src/
│   ├── __init__.py
│   ├── job_scraper.py      # LinkedIn automation
│   ├── resume_evaluator.py # OpenAI evaluation
│   ├── ats_scorer.py       # Scoring and ranking
│   └── output_writer.py    # Excel output
├── resume/
│   └── master_resume.txt   # Your resume
├── config/
│   └── company_blacklist.txt
├── job_descriptions/       # Saved job descriptions
└── outputs/
    └── job_evaluations.xlsx
```

## Important Notes

### LinkedIn Rate Limiting

- The automation includes safety delays between actions
- Adjust `ACTION_DELAY` in `.env` if needed (default: 2 seconds)
- Don't run too frequently to avoid account restrictions

### Chrome Profile Requirements

- LinkedIn must be logged in and session active
- Close Chrome before running (Playwright needs exclusive access to profile)
- Use a dedicated Chrome profile if needed

### OpenAI API Usage

- Each job evaluation uses ~2000-3000 tokens
- 40 jobs ≈ 100k tokens (~$1-3 depending on model)
- Uses GPT-4 Turbo by default for best results

## Troubleshooting

### "Not logged into LinkedIn"

1. Open Chrome normally and log into LinkedIn
2. Close Chrome completely
3. Run the automation again

### "Chrome profile locked"

1. Close all Chrome windows
2. Check for Chrome processes: `pkill -f "Google Chrome"`
3. Try again

### "OpenAI API error"

1. Verify API key in `.env`
2. Check OpenAI account has credits
3. Try using `gpt-3.5-turbo` as fallback

### "No jobs found"

1. LinkedIn's HTML structure may have changed
2. Try running with different search keywords
3. Check if filters are being applied correctly

## License

MIT License - Use at your own risk. This tool is for personal job search assistance only.
