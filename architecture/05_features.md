# ClawdBot — Feature Systems Deep Dive

> **Who this is for:** A developer who knows how to code but hasn't built a full-stack
> automation platform before. Every concept is explained with an analogy before the
> technical detail.

---

## SECTION A: WEB SCRAPING PIPELINE

### What is web scraping?

Think of it like this: instead of *you* opening Chrome, going to LinkedIn, typing a search,
and copying job listings into a spreadsheet — you write a program that does all of that for
you, automatically, hundreds of times a minute.

There are two kinds of websites:
- **Static HTML** — the page's content is already in the raw HTML when it loads (like a
  newspaper). BeautifulSoup is perfect here — it reads the HTML like a document.
- **JavaScript-heavy sites** — the page loads a blank shell and then JavaScript fills it in
  (like LinkedIn). You need a real browser to render it first.

---

### Tools

**Playwright** — "A robot that controls a real browser"

Playwright literally opens a Chromium (Chrome) window, moves the mouse, clicks buttons,
waits for JavaScript to load, and reads the result. It handles logins, popups, and dynamic
content because it *is* a real browser. You already use this in
`src/scraper/job_scraper.py`.

```python
# What Playwright does under the hood
from playwright.sync_api import sync_playwright

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)   # Open invisible Chrome
    page = browser.new_page()
    page.goto("https://www.linkedin.com/jobs/search/?keywords=software+engineer")
    page.wait_for_selector(".job-card-container")  # Wait for JS to render
    html = page.content()                          # Now grab the HTML
    browser.close()
```

**BeautifulSoup** — "A GPS for HTML"

Once Playwright hands you the raw HTML string, BeautifulSoup lets you navigate it like a
map: "give me all `<div>` tags with class `job-card-container`".

```python
from bs4 import BeautifulSoup

soup = BeautifulSoup(html, "html.parser")
job_cards = soup.find_all("div", class_="job-card-container")
for card in job_cards:
    title = card.find("a", class_="job-card-list__title").text.strip()
    company = card.find("span", class_="job-card-container__primary-description").text.strip()
```

---

### Anti-Bot Strategy

Websites protect themselves from scrapers. Think of it like a bouncer at a club — if 1000
people walk in wearing identical clothes at the exact same pace, the bouncer gets suspicious.

| Technique | Plain English | Implementation |
|---|---|---|
| **Rotating User Agents** | Each request claims to be a different browser/OS | Random UA string from a pool |
| **Random Delays** | Don't be a robot — pause between actions | `time.sleep(random.uniform(1.5, 4.0))` |
| **Proxy Rotation** | Change your IP address so the site can't ban you | Paid proxy service (Bright Data, Oxylabs) |
| **Human-like behavior** | Scroll slowly, move mouse, don't instant-click | Playwright's `page.mouse.move()` |
| **Respect robots.txt** | Check what the site allows before scraping | Check `/robots.txt` first |
| **Session reuse** | Reuse cookies instead of logging in every request | Save Chrome profile (you already do this) |

```python
# Rotating user agents — add to job_scraper.py
import random

USER_AGENTS = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/119.0.0.0 Safari/537.36",
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/118.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0",
]

def get_random_ua() -> str:
    return random.choice(USER_AGENTS)

# Apply when launching browser
context = browser.new_context(user_agent=get_random_ua())
```

```python
# Human-like delay helper
import time
import random

def human_delay(min_sec: float = 1.5, max_sec: float = 4.0):
    """Pause for a random amount of time, like a human would."""
    time.sleep(random.uniform(min_sec, max_sec))

# Use it between every action
page.click(".job-card-container")
human_delay()
page.scroll_into_view_if_needed(".job-description")
human_delay(0.5, 1.5)
```

---

### The Complete Scraping Pipeline — Step by Step

Here is the full journey from "user presses Scrape" to "job saved in database":

```
┌─────────────────────────────────────────────────────────────────────┐
│  SCRAPING PIPELINE                                                  │
│                                                                     │
│  1. User triggers scrape (button in UI or scheduled cron job)       │
│         │                                                           │
│         ▼                                                           │
│  2. FastAPI endpoint creates a Celery task                          │
│     POST /api/scrape → celery.send_task("scrape_jobs", args=[...]) │
│         │                                                           │
│         ▼                                                           │
│  3. Celery worker picks up the task                                 │
│     (runs in background, doesn't block the API)                    │
│         │                                                           │
│         ▼                                                           │
│  4. Playwright opens browser, navigates to LinkedIn/Indeed          │
│     → applies search filters (role, location, date posted)         │
│     → scrolls through results pages                                │
│         │                                                           │
│         ▼                                                           │
│  5. Extract job data from each card:                                │
│     title, company, description, URL, salary, location, date       │
│         │                                                           │
│         ▼                                                           │
│  6. Deduplication check                                             │
│     → build_job_id(company, title, url) → SHA1 hash               │
│     → check if job_id already exists in database                   │
│     → if yes: skip. if no: continue.                               │
│         │                                                           │
│         ▼                                                           │
│  7. Store to database (Job table in PostgreSQL)                     │
│         │                                                           │
│         ▼                                                           │
│  8. Trigger scoring pipeline (another Celery task)                 │
│     → send to Claude for match scoring                             │
│     → update MatchedJob record with score                          │
└─────────────────────────────────────────────────────────────────────┘
```

#### Step 1 — Trigger

Two ways to trigger a scrape:

```python
# api/jobs.py — Manual trigger from frontend button
@router.post("/scrape/start")
async def start_scrape(
    config: ScrapeConfig,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    # Create a ScrapeRun record to track progress
    scrape_run = ScrapeRun(
        user_id=current_user.id,
        status="queued",
        config=config.model_dump()
    )
    db.add(scrape_run)
    db.commit()

    # Fire the Celery task (runs in background)
    task = scrape_jobs_task.delay(
        user_id=current_user.id,
        scrape_run_id=scrape_run.id,
        config=config.model_dump()
    )
    return {"scrape_run_id": scrape_run.id, "task_id": task.id}
```

```python
# Scheduled trigger — celery beat schedule (in celery config)
# Like setting an alarm: "run scrape_jobs every day at 9am"
from celery.schedules import crontab

CELERYBEAT_SCHEDULE = {
    "daily-scrape": {
        "task": "tasks.scrape_jobs",
        "schedule": crontab(hour=9, minute=0),  # 9:00 AM every day
    }
}
```

#### Step 2 — Celery Task Definition

```python
# src/tasks/scraper_tasks.py
from celery import shared_task
from src.scraper.job_scraper import JobScraper
from src.database import SessionLocal
from src import models

@shared_task(bind=True, max_retries=3)
def scrape_jobs_task(self, user_id: int, scrape_run_id: int, config: dict):
    """
    Background task: runs the full scrape pipeline.
    'bind=True' means self = the task itself (for retries).
    'max_retries=3' means try up to 3 times before giving up.
    """
    db = SessionLocal()
    try:
        # Update status to "running"
        run = db.query(models.ScrapeRun).filter_by(id=scrape_run_id).first()
        run.status = "running"
        db.commit()

        # Run the actual scraper
        scraper = JobScraper(config=config)
        jobs = scraper.scrape(user_id=user_id)

        # Save jobs to database
        saved_count = 0
        for job_data in jobs:
            saved = save_job_if_new(db, user_id, job_data)
            if saved:
                saved_count += 1
                # Immediately queue scoring for this job
                score_job_task.delay(user_id=user_id, job_id=saved.id)

        run.status = "completed"
        run.jobs_found = len(jobs)
        run.jobs_saved = saved_count
        db.commit()

    except Exception as exc:
        run.status = "failed"
        run.error_message = str(exc)
        db.commit()
        # Retry after 60 seconds
        raise self.retry(exc=exc, countdown=60)
    finally:
        db.close()
```

#### Step 3 — Data Extraction Patterns

**LinkedIn extraction pattern:**

LinkedIn's HTML structure as of 2024 (note: this changes — always add error handling):

```python
def extract_linkedin_jobs(page) -> list[dict]:
    """Extract job listings from a LinkedIn search results page."""
    jobs = []

    # Wait for job cards to appear
    page.wait_for_selector("ul.jobs-search__results-list", timeout=10000)
    soup = BeautifulSoup(page.content(), "html.parser")

    job_cards = soup.find_all("li", class_=lambda c: c and "jobs-search__results-list" in c)

    for card in job_cards:
        try:
            title_el = card.find("h3", class_="base-search-card__title")
            company_el = card.find("h4", class_="base-search-card__subtitle")
            location_el = card.find("span", class_="job-search-card__location")
            link_el = card.find("a", class_="base-card__full-link")
            date_el = card.find("time")

            if not title_el or not link_el:
                continue  # Skip malformed cards

            jobs.append({
                "title": title_el.text.strip(),
                "company": company_el.text.strip() if company_el else "Unknown",
                "location": location_el.text.strip() if location_el else "",
                "url": link_el.get("href", ""),
                "posted_date": date_el.get("datetime") if date_el else None,
                "source": "linkedin",
            })
        except Exception as e:
            # One bad card shouldn't kill the whole page
            print(f"[WARN] Failed to parse LinkedIn card: {e}")
            continue

    return jobs
```

**Indeed extraction pattern:**

```python
def extract_indeed_jobs(page) -> list[dict]:
    """Extract job listings from an Indeed search results page."""
    jobs = []

    page.wait_for_selector("#mosaic-provider-jobcards", timeout=10000)
    soup = BeautifulSoup(page.content(), "html.parser")

    # Indeed uses data-jk attribute as job ID
    job_cards = soup.find_all("div", attrs={"data-jk": True})

    for card in job_cards:
        try:
            title_el = card.find("h2", class_="jobTitle")
            company_el = card.find("span", class_="companyName")
            location_el = card.find("div", class_="companyLocation")
            salary_el = card.find("div", class_="salary-snippet-container")

            job_id = card.get("data-jk")
            url = f"https://www.indeed.com/viewjob?jk={job_id}"

            if not title_el:
                continue

            jobs.append({
                "title": title_el.text.strip(),
                "company": company_el.text.strip() if company_el else "Unknown",
                "location": location_el.text.strip() if location_el else "",
                "salary": salary_el.text.strip() if salary_el else None,
                "url": url,
                "source": "indeed",
            })
        except Exception as e:
            print(f"[WARN] Failed to parse Indeed card: {e}")
            continue

    return jobs
```

#### Step 4 — Deduplication

You already have this in `src/scraper/history_manager.py`. Here is the database-backed
version for multi-user SaaS:

```python
import hashlib

def build_job_id(company: str, title: str, url: str) -> str:
    """
    Build a stable, unique ID for a job.
    SHA1 hash of company+title+url — same job always gets same ID.
    Like a fingerprint: unique to this specific posting.
    """
    text = f"{company.lower()}|{title.lower()}|{url.lower()}"
    return hashlib.sha1(text.encode()).hexdigest()[:16]

def save_job_if_new(db, user_id: int, job_data: dict):
    """
    Save a job only if we haven't seen it before.
    Returns the Job object if saved, None if it was a duplicate.
    """
    job_id = build_job_id(
        company=job_data["company"],
        title=job_data["title"],
        url=job_data["url"]
    )

    # Check if this job already exists for this user
    existing = db.query(Job).filter_by(
        user_id=user_id,
        job_id=job_id
    ).first()

    if existing:
        return None  # Skip duplicate

    # Create new job record
    job = Job(
        user_id=user_id,
        job_id=job_id,
        title=job_data["title"],
        company=job_data["company"],
        location=job_data.get("location"),
        salary=job_data.get("salary"),
        url=job_data["url"],
        description=job_data.get("description", ""),
        source=job_data.get("source", "unknown"),
    )
    db.add(job)
    db.commit()
    return job
```

#### Step 5 — Rate Limiting

Think of rate limiting like a speed limit on a highway. Going too fast gets you banned
(IP blocked). Too slow and you scrape 10 jobs when you could scrape 1000.

```python
# src/scraper/rate_limiter.py
import time
import random
from functools import wraps

class RateLimiter:
    """
    Controls how fast we scrape.

    Think of it like a traffic light: it makes sure we don't
    go faster than the site allows.
    """

    def __init__(self, min_delay: float = 2.0, max_delay: float = 5.0):
        self.min_delay = min_delay
        self.max_delay = max_delay
        self.last_request_time = 0

    def wait(self):
        """Wait an appropriate amount of time before the next request."""
        elapsed = time.time() - self.last_request_time
        required_delay = random.uniform(self.min_delay, self.max_delay)

        if elapsed < required_delay:
            time.sleep(required_delay - elapsed)

        self.last_request_time = time.time()

# Recommended delays by site:
# LinkedIn: 3–6 seconds between page loads
# Indeed:   2–4 seconds
# Glassdoor: 4–8 seconds (most aggressive anti-bot)
```

#### Step 6 — Error Handling When Page Structure Changes

Websites redesign their HTML all the time. "Brittle" scrapers break the second a CSS
class name changes. Here is how to build a resilient scraper:

```python
# src/scraper/extractors/base.py

class SafeExtractor:
    """
    Wraps BeautifulSoup extraction so one missing element
    doesn't crash the whole run.

    Think of it like: try to open this door, and if the door
    doesn't exist, write it in the log and move on.
    """

    def safe_text(self, element, selector: str, attr: str = None) -> str | None:
        """Extract text safely — returns None instead of crashing."""
        try:
            found = element.find(selector) if isinstance(selector, str) else selector
            if found is None:
                return None
            if attr:
                return found.get(attr)
            return found.text.strip() or None
        except Exception:
            return None

    def safe_find(self, soup, *args, **kwargs):
        """Find an element, return None if not found (no exceptions)."""
        try:
            return soup.find(*args, **kwargs)
        except Exception:
            return None
```

```python
# Monitoring: alert when extraction yield drops
# If we're extracting fewer fields than usual, the HTML structure likely changed.

def check_extraction_health(jobs: list[dict]) -> dict:
    """
    Audit extraction quality.
    If fewer than 70% of jobs have descriptions, something broke.
    """
    total = len(jobs)
    if total == 0:
        return {"healthy": False, "reason": "No jobs extracted at all"}

    has_description = sum(1 for j in jobs if j.get("description"))
    has_company = sum(1 for j in jobs if j.get("company"))

    desc_rate = has_description / total
    co_rate = has_company / total

    if desc_rate < 0.7:
        # Log this — probably the HTML structure changed
        return {
            "healthy": False,
            "reason": f"Only {desc_rate:.0%} of jobs have descriptions. HTML may have changed."
        }

    return {"healthy": True, "description_rate": desc_rate, "company_rate": co_rate}
```

---

### Pydantic Schema for a Scraped Job

Pydantic is like a strict form validator — if the data doesn't match the expected types
and required fields, it rejects the data with a clear error before it touches the database.

```python
# src/schemas/job.py
from pydantic import BaseModel, HttpUrl, field_validator
from typing import Optional
from datetime import datetime
from enum import Enum

class JobSource(str, Enum):
    linkedin  = "linkedin"
    indeed    = "indeed"
    glassdoor = "glassdoor"
    unknown   = "unknown"

class ScrapedJobSchema(BaseModel):
    """
    Pydantic model for a job freshly extracted by the scraper.
    Think of this as the "intake form" — every job must fill this out
    before being admitted to the database.
    """
    # Required fields — if any of these are missing, reject the job
    title:       str
    company:     str
    url:         str   # Use str not HttpUrl for flexibility with redirects

    # Optional fields — nice to have
    location:    Optional[str]    = None
    salary:      Optional[str]    = None
    description: Optional[str]   = None
    posted_date: Optional[str]   = None  # Keep as string, normalize later
    source:      JobSource        = JobSource.unknown
    is_premium:  bool             = False
    search_query: Optional[str]  = None
    role_type:   Optional[str]   = None  # "Internship", "Entry-level", etc.

    # Generated fields (not from scraper)
    job_id:      Optional[str]   = None  # SHA1 hash, computed on save
    scraped_at:  datetime         = None

    @field_validator("title", "company")
    @classmethod
    def strip_whitespace(cls, v: str) -> str:
        """Remove leading/trailing whitespace from text fields."""
        return v.strip()

    @field_validator("url")
    @classmethod
    def validate_url(cls, v: str) -> str:
        """Ensure URL is not empty."""
        if not v or not v.startswith("http"):
            raise ValueError(f"Invalid URL: {v}")
        return v

    @field_validator("description")
    @classmethod
    def truncate_description(cls, v: str | None) -> str | None:
        """Cap description at 10,000 chars to prevent DB bloat."""
        if v and len(v) > 10_000:
            return v[:10_000] + "..."
        return v

    class Config:
        use_enum_values = True


class JobInDB(ScrapedJobSchema):
    """
    Job as it lives in the database — adds DB-specific fields.
    Inherits all fields from ScrapedJobSchema.
    """
    id:         int
    user_id:    int
    status:     str       = "new"    # new, applied, rejected, interviewing, offer
    score:      Optional[float] = None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True  # Allows creating from SQLAlchemy model
```

---

## SECTION B: LLM PIPELINE (Claude API)

### Understanding Costs — Plain English

The Claude API charges by "tokens." A token is roughly 3/4 of a word (so "understanding"
= 3 tokens). Think of it like a per-word charge at a copy shop.

| Model | Input price | Output price |
|---|---|---|
| Claude 3 Haiku | $0.25 / 1M tokens | $1.25 / 1M tokens |
| Claude 3.5 Sonnet | $3.00 / 1M tokens | $15.00 / 1M tokens |
| Claude 3 Opus | $15.00 / 1M tokens | $75.00 / 1M tokens |

**Practical example:** A job description is ~500 words ≈ 650 tokens. Your resume is
~400 words ≈ 520 tokens. Sending both to Sonnet costs roughly:
`(650 + 520) / 1,000,000 * $3.00 = $0.0000035` — less than a thousandth of a cent.

You can score 1,000 jobs for about $3.50 with Sonnet, or $0.35 with Haiku.

**Use Haiku for high-volume, cheap tasks** (email filtering, quick scoring).
**Use Sonnet for quality tasks** (resume tailoring, detailed scoring).

---

### Prompt Caching — "Pay for your resume once, not 1000 times"

Anthropic's prompt caching works like this: if you send the same chunk of text (like your
resume) at the start of 1000 different requests, Claude caches it after the first time and
only charges 10% of the price for that chunk on all future requests.

```
Without caching: 1000 requests × (resume tokens + job tokens) × full price
With caching:    1 request × resume tokens × full price
               + 999 requests × resume tokens × 10% price
               + 1000 requests × job tokens × full price
```

**You save ~90% on the resume portion of every call.**

```python
# src/llm/claude_client.py
import anthropic
from src.settings import settings

client = anthropic.Anthropic(api_key=settings.ANTHROPIC_API_KEY)

def call_claude_with_cache(
    system_prompt: str,
    cached_content: str,     # Your resume — cached across requests
    dynamic_content: str,    # The job description — changes every request
    model: str = "claude-3-haiku-20240307",
    max_tokens: int = 1024,
) -> tuple[str, dict]:
    """
    Call Claude API with prompt caching enabled.

    Returns:
        (response_text, usage_stats)

    The 'cache_control' marker tells Claude:
    "Everything before this point, remember for next time."
    """
    response = client.messages.create(
        model=model,
        max_tokens=max_tokens,
        system=[
            {
                "type": "text",
                "text": system_prompt,
            }
        ],
        messages=[
            {
                "role": "user",
                "content": [
                    # This part gets CACHED — your resume stays in memory
                    {
                        "type": "text",
                        "text": cached_content,
                        "cache_control": {"type": "ephemeral"}  # Cache this!
                    },
                    # This part is DYNAMIC — changes each request
                    {
                        "type": "text",
                        "text": dynamic_content
                    }
                ]
            }
        ]
    )

    usage = {
        "input_tokens": response.usage.input_tokens,
        "output_tokens": response.usage.output_tokens,
        "cache_creation_tokens": getattr(response.usage, "cache_creation_input_tokens", 0),
        "cache_read_tokens": getattr(response.usage, "cache_read_input_tokens", 0),
    }

    return response.content[0].text, usage
```

---

### Feature 1: Resume Tailoring

**What it does:** Takes your generic resume and a specific job description, and rewrites
sections of your resume to match the keywords and requirements in that job posting.

**Why the structure matters:** The prompt is structured like a clear assignment brief.
Claude works best when you tell it: (1) what role it's playing, (2) what the rules are,
(3) what the input is, (4) exactly what format to respond in.

```python
# src/llm/prompts/resume_tailor.py

RESUME_TAILOR_SYSTEM_PROMPT = """
You are an expert resume writer and career coach. Your job is to tailor
sections of a candidate's resume to better match a specific job description.

RULES:
1. Do NOT invent experience or skills the candidate does not have.
2. Only rewrite content using information already present in the resume.
3. Rephrase bullet points to use the job's keywords naturally.
4. Prioritize the candidate's most relevant experience for this role.
5. Keep the same factual content — only improve the wording and emphasis.
6. Return JSON only — no explanations, no markdown outside the JSON.
"""

RESUME_TAILOR_USER_TEMPLATE = """
## CANDIDATE RESUME
{resume_text}

---

## TARGET JOB DESCRIPTION
{job_description}

---

## TASK
Rewrite the candidate's resume summary and top 3 work experience bullet points
to better match the job description above. Use the job's keywords naturally.

Return ONLY this JSON structure:
{{
  "tailored_summary": "2-3 sentence professional summary tailored to this role",
  "tailored_bullets": [
    "Rewritten bullet point 1 (from most recent/relevant job)",
    "Rewritten bullet point 2",
    "Rewritten bullet point 3"
  ],
  "keywords_added": ["keyword1", "keyword2", "keyword3"],
  "match_explanation": "One sentence explaining why this candidate is a good fit"
}}
"""

def tailor_resume(resume_text: str, job_description: str) -> dict:
    """
    Tailor a resume to a job description using Claude.

    Args:
        resume_text:      The candidate's full resume as plain text
        job_description:  The full job posting text

    Returns:
        dict with tailored_summary, tailored_bullets, keywords_added, match_explanation
    """
    import json
    from src.llm.claude_client import call_claude_with_cache
    from src.llm.cost_tracker import log_llm_call

    prompt = RESUME_TAILOR_USER_TEMPLATE.format(
        resume_text=resume_text,
        job_description=job_description[:3000]  # Cap at 3000 chars to control cost
    )

    response_text, usage = call_claude_with_cache(
        system_prompt=RESUME_TAILOR_SYSTEM_PROMPT,
        cached_content=f"## CANDIDATE RESUME\n{resume_text}",  # Resume is cached
        dynamic_content=f"## TARGET JOB DESCRIPTION\n{job_description[:3000]}",
        model="claude-3-5-sonnet-20241022",  # Use Sonnet for quality tailoring
        max_tokens=1500,
    )

    # Log this call for cost tracking
    log_llm_call(
        feature="resume_tailoring",
        input_tokens=usage["input_tokens"],
        output_tokens=usage["output_tokens"],
        cache_read_tokens=usage["cache_read_tokens"],
        model="claude-3-5-sonnet-20241022",
    )

    try:
        return json.loads(response_text)
    except json.JSONDecodeError:
        # Claude sometimes wraps JSON in markdown fences — strip them
        cleaned = response_text.replace("```json", "").replace("```", "").strip()
        return json.loads(cleaned)
```

---

### Feature 2: Job Match Scoring

**What it does:** Gives each job a score from 0–100 based on how well your resume and
profile match the job requirements. This is what powers the "Best Match" sorting.

**Scoring rubric:** The rubric inside the prompt tells Claude *how* to weigh different
factors. Without a rubric, scores are inconsistent — Claude might give a 90 for a weak
match one time and a 70 for a strong match another time.

```python
# src/llm/prompts/job_scoring.py

JOB_SCORE_SYSTEM_PROMPT = """
You are a technical recruiter scoring job-candidate fit on a 0-100 scale.
You are objective, consistent, and base scores only on evidence in the resume and job description.
Return JSON only.
"""

JOB_SCORE_USER_TEMPLATE = """
## CANDIDATE PROFILE
Name: {candidate_name}
Target roles: {target_roles}
Seniority: {seniority}
Skills: {skills}
Resume summary:
{resume_summary}

---

## JOB DESCRIPTION
Title: {job_title}
Company: {job_company}
Location: {job_location}
Description:
{job_description}

---

## SCORING RUBRIC
Score the candidate's fit for this job using the following weights:

- Skills match (35 points): How many required/preferred skills does the candidate have?
  35 = has all required skills
  25 = has most required skills
  15 = has some required skills
  5  = few relevant skills

- Experience level (25 points): Does the candidate's seniority match the role?
  25 = perfect match (e.g. senior for senior role)
  15 = one level off (e.g. mid-level for senior role)
  5  = significantly off (e.g. junior for staff role)

- Domain relevance (20 points): Is the candidate's industry/domain background relevant?
  20 = exact domain match
  12 = adjacent domain
  5  = unrelated domain

- Role title alignment (10 points): Is the job title similar to the candidate's target roles?
  10 = exact or very close match
  5  = related role
  2  = different role category

- Location/work-mode (10 points): Does the location and remote/hybrid/onsite match?
  10 = perfect match
  5  = partial match (willing to relocate, or hybrid when candidate wants remote)
  0  = mismatch

---

## TASK
Score this candidate for this job. Return ONLY this JSON:
{{
  "score": <integer 0-100>,
  "skills_score": <integer 0-35>,
  "experience_score": <integer 0-25>,
  "domain_score": <integer 0-20>,
  "title_score": <integer 0-10>,
  "location_score": <integer 0-10>,
  "matched_skills": ["skill1", "skill2"],
  "missing_skills": ["skill3", "skill4"],
  "reasoning": "2-3 sentence explanation of the score",
  "recommendation": "apply" | "consider" | "skip"
}}

Recommendations:
  "apply"     = score >= 70 (strong match, apply immediately)
  "consider"  = score 45-69 (worth reviewing, apply if few better options)
  "skip"      = score < 45 (poor fit, not worth the time)
"""

def score_job_match(
    resume_text: str,
    profile: dict,
    job: dict,
) -> dict:
    """
    Score a job-candidate match using Claude.

    Use Haiku for cost efficiency — this runs for every job scraped.
    """
    import json
    from src.llm.claude_client import call_claude_with_cache
    from src.llm.cost_tracker import log_llm_call

    # Build the resume cache content — this gets cached across all jobs
    cached_resume = f"""
## CANDIDATE PROFILE
Name: {profile.get('full_name', 'Candidate')}
Target roles: {', '.join(profile.get('target_roles', []))}
Seniority: {profile.get('seniority', 'Not specified')}
Skills: {', '.join(profile.get('parsed_skills', [])[:20])}
Resume:
{resume_text[:2000]}
"""

    dynamic_job = f"""
## JOB TO SCORE
Title: {job['title']}
Company: {job['company']}
Location: {job.get('location', 'Not specified')}
Description:
{job.get('description', '')[:2500]}

{JOB_SCORE_USER_TEMPLATE.split('---')[2]}  # The scoring rubric + task section
"""

    response_text, usage = call_claude_with_cache(
        system_prompt=JOB_SCORE_SYSTEM_PROMPT,
        cached_content=cached_resume,
        dynamic_content=dynamic_job,
        model="claude-3-haiku-20240307",  # Haiku = cheap, good enough for scoring
        max_tokens=600,
    )

    log_llm_call(
        feature="job_scoring",
        input_tokens=usage["input_tokens"],
        output_tokens=usage["output_tokens"],
        cache_read_tokens=usage["cache_read_tokens"],
        model="claude-3-haiku-20240307",
    )

    try:
        return json.loads(response_text)
    except json.JSONDecodeError:
        cleaned = response_text.replace("```json", "").replace("```", "").strip()
        return json.loads(cleaned)
```

---

### Feature 3: Email Importance Filtering

**What it does:** For each new email in the user's Gmail inbox, Claude reads the subject
and first 200 characters and decides: "Is this job-related? And if yes, how important is
it?" This prevents drowning in promotional emails while surfacing actual interview invites.

```python
# src/llm/prompts/email_filter.py

EMAIL_FILTER_SYSTEM_PROMPT = """
You are an email classifier for a job seeker's inbox.
Your job is to identify job-application-related emails and classify their importance.
Be conservative: when in doubt, classify as important (false negatives are worse than false positives).
Return JSON only.
"""

EMAIL_FILTER_USER_TEMPLATE = """
## EMAIL TO CLASSIFY
Subject: {subject}
From: {sender}
Preview (first 200 chars): {preview}

---

## TASK
Classify this email. Return ONLY this JSON:
{{
  "is_job_related": true | false,
  "category": "interview_invite" | "application_received" | "rejection" | "offer" | "assessment" | "general_job" | "not_job_related",
  "importance": "urgent" | "high" | "medium" | "low",
  "action_required": true | false,
  "reason": "One sentence explaining the classification"
}}

Category definitions:
  interview_invite      = They want to schedule an interview with you
  application_received  = Confirmation that your application was received
  rejection             = They are rejecting your application
  offer                 = A job offer or compensation discussion
  assessment            = A coding test, take-home assignment, or online assessment
  general_job           = Job-related but not one of the above (recruiter outreach, etc.)
  not_job_related       = Not related to job applications at all

Importance definitions:
  urgent  = Requires response within 24 hours (interview scheduling, offer deadline)
  high    = Should read today (rejection, assessment deadline)
  medium  = Read within a few days (application confirmations, recruiter outreach)
  low     = Can archive (automated job alert digests)
"""

def classify_email(subject: str, sender: str, preview: str) -> dict:
    """
    Classify a single email using Claude Haiku (cheap and fast).

    Note: We only send subject, sender, and first 200 chars — never the full body.
    This is for privacy (minimal data sent to the API) and cost efficiency.
    """
    import json
    from src.llm.claude_client import call_claude_with_cache
    from src.llm.cost_tracker import log_llm_call

    prompt = EMAIL_FILTER_USER_TEMPLATE.format(
        subject=subject[:200],
        sender=sender[:100],
        preview=preview[:200]
    )

    response_text, usage = call_claude_with_cache(
        system_prompt=EMAIL_FILTER_SYSTEM_PROMPT,
        cached_content="",   # No caching needed — requests are tiny
        dynamic_content=prompt,
        model="claude-3-haiku-20240307",  # Always use Haiku for email filtering
        max_tokens=200,
    )

    log_llm_call(
        feature="email_filtering",
        input_tokens=usage["input_tokens"],
        output_tokens=usage["output_tokens"],
        cache_read_tokens=0,
        model="claude-3-haiku-20240307",
    )

    try:
        return json.loads(response_text)
    except json.JSONDecodeError:
        cleaned = response_text.replace("```json", "").replace("```", "").strip()
        return json.loads(cleaned)
```

---

### Streaming Responses — "AI is typing..."

Streaming means Claude sends words back one at a time as they are generated, instead of
waiting until the entire response is ready. For resume tailoring, this creates the
satisfying "AI is writing your resume right now" experience.

Think of it like a printer: streaming prints word by word as the page comes out, instead of
waiting until the whole document is ready before showing anything.

```python
# src/llm/streaming.py
import anthropic
from fastapi import HTTPException
from fastapi.responses import StreamingResponse

client = anthropic.Anthropic(api_key=settings.ANTHROPIC_API_KEY)

async def stream_resume_tailor(resume_text: str, job_description: str):
    """
    Generator function that streams Claude's response token by token.

    The frontend connects with EventSource (SSE — Server-Sent Events)
    and displays each chunk as it arrives.
    """
    with client.messages.stream(
        model="claude-3-5-sonnet-20241022",
        max_tokens=1500,
        system=RESUME_TAILOR_SYSTEM_PROMPT,
        messages=[{
            "role": "user",
            "content": RESUME_TAILOR_USER_TEMPLATE.format(
                resume_text=resume_text,
                job_description=job_description[:3000]
            )
        }]
    ) as stream:
        for text_chunk in stream.text_stream:
            # Send each chunk as a Server-Sent Event
            yield f"data: {text_chunk}\n\n"

        # Signal that streaming is complete
        yield "data: [DONE]\n\n"


# FastAPI endpoint for streaming
@router.get("/jobs/{job_id}/tailor-stream")
async def tailor_resume_stream(
    job_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Stream the resume tailoring response to the frontend.
    The frontend receives tokens in real-time and displays them progressively.
    """
    job = db.query(Job).filter_by(id=job_id, user_id=current_user.id).first()
    resume = db.query(ResumeAsset).filter_by(user_id=current_user.id).first()

    if not job or not resume:
        raise HTTPException(status_code=404, detail="Job or resume not found")

    return StreamingResponse(
        stream_resume_tailor(resume.original_text, job.description),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no"  # Disable nginx buffering
        }
    )
```

```javascript
// Frontend: dashboard/src/hooks/useStreamTailor.js
// React hook to consume the SSE stream

import { useState, useCallback } from "react";

export function useStreamTailor() {
  const [streamText, setStreamText] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);

  const startTailoring = useCallback((jobId) => {
    setStreamText("");
    setIsStreaming(true);

    // EventSource is the browser's built-in SSE reader
    const eventSource = new EventSource(`/api/jobs/${jobId}/tailor-stream`, {
      withCredentials: true,
    });

    eventSource.onmessage = (event) => {
      if (event.data === "[DONE]") {
        setIsStreaming(false);
        eventSource.close();
        return;
      }
      // Append each chunk to the displayed text
      setStreamText((prev) => prev + event.data);
    };

    eventSource.onerror = () => {
      setIsStreaming(false);
      eventSource.close();
    };
  }, []);

  return { streamText, isStreaming, startTailoring };
}
```

---

### Cost Tracking — Log Every LLM Call

Never fly blind on API costs. Log every call so you know which features are expensive and
whether the caching is working. Think of it like a receipt printer — every transaction
gets recorded automatically.

```python
# src/llm/cost_tracker.py
from datetime import datetime
from src.database import SessionLocal
from src import models

# Prices per 1M tokens as of April 2024
PRICE_TABLE = {
    "claude-3-haiku-20240307":      {"input": 0.25,  "output": 1.25,  "cache_read": 0.03},
    "claude-3-5-sonnet-20241022":   {"input": 3.00,  "output": 15.00, "cache_read": 0.30},
    "claude-3-opus-20240229":       {"input": 15.00, "output": 75.00, "cache_read": 1.50},
}

def calculate_cost(model: str, input_tokens: int, output_tokens: int, cache_read_tokens: int = 0) -> float:
    """Calculate the dollar cost of a single LLM call."""
    prices = PRICE_TABLE.get(model, {"input": 3.0, "output": 15.0, "cache_read": 0.3})
    cost = (
        (input_tokens - cache_read_tokens) / 1_000_000 * prices["input"] +
        cache_read_tokens / 1_000_000 * prices["cache_read"] +
        output_tokens / 1_000_000 * prices["output"]
    )
    return round(cost, 8)

def log_llm_call(
    feature: str,
    input_tokens: int,
    output_tokens: int,
    cache_read_tokens: int,
    model: str,
    user_id: int = None,
    job_id: int = None,
):
    """
    Record this LLM call in the database.
    Called automatically after every Claude API request.
    """
    db = SessionLocal()
    try:
        cost = calculate_cost(model, input_tokens, output_tokens, cache_read_tokens)
        record = models.LLMCallLog(
            user_id=user_id,
            job_id=job_id,
            feature=feature,
            model=model,
            input_tokens=input_tokens,
            output_tokens=output_tokens,
            cache_read_tokens=cache_read_tokens,
            cost_usd=cost,
            created_at=datetime.utcnow(),
        )
        db.add(record)
        db.commit()
    finally:
        db.close()
```

---

### Retry Logic for API Failures

The Claude API occasionally times out or returns errors (HTTP 529 = overloaded). Build in
retries the same way you'd retry a phone call that got dropped.

```python
# src/llm/retry.py
import time
import anthropic
from functools import wraps

def with_retry(max_attempts: int = 3, base_delay: float = 1.0):
    """
    Decorator that retries a function on API errors.

    Uses exponential backoff: wait 1s, then 2s, then 4s.
    This prevents hammering an already-overloaded API.
    """
    def decorator(func):
        @wraps(func)
        def wrapper(*args, **kwargs):
            last_error = None
            for attempt in range(max_attempts):
                try:
                    return func(*args, **kwargs)
                except anthropic.RateLimitError as e:
                    # Hit the rate limit — back off and retry
                    wait = base_delay * (2 ** attempt)
                    print(f"[LLM] Rate limited. Waiting {wait}s before retry {attempt + 1}/{max_attempts}")
                    time.sleep(wait)
                    last_error = e
                except anthropic.APIStatusError as e:
                    if e.status_code == 529:  # Overloaded
                        wait = base_delay * (2 ** attempt)
                        print(f"[LLM] API overloaded. Waiting {wait}s before retry {attempt + 1}/{max_attempts}")
                        time.sleep(wait)
                        last_error = e
                    else:
                        raise  # Don't retry on other errors (400, 401, etc.)
                except anthropic.APITimeoutError as e:
                    wait = base_delay * (2 ** attempt)
                    print(f"[LLM] Timeout. Waiting {wait}s before retry {attempt + 1}/{max_attempts}")
                    time.sleep(wait)
                    last_error = e

            raise last_error  # All retries failed

        return wrapper
    return decorator

# Usage:
@with_retry(max_attempts=3, base_delay=1.0)
def call_claude_safe(*args, **kwargs):
    return call_claude_with_cache(*args, **kwargs)
```

---

## SECTION C: EMAIL MONITORING SYSTEM

### Gmail API Setup — OAuth 2.0 in Plain English

OAuth 2.0 is like a hotel key card system. You (ClawdBot) go to the front desk (Google)
and say "I need access to this guest's room (Gmail inbox)." Google asks the guest (the
user) "Is this OK?" The guest says yes. Google gives ClawdBot a key card (access token)
that only works for specific things (reading emails) and expires after a while.

The key point: **ClawdBot never sees the user's Google password.** It only gets a token.

```
Step-by-step OAuth flow:

1. User clicks "Connect Gmail" in ClawdBot dashboard
2. Frontend redirects to:
   https://accounts.google.com/o/oauth2/auth
   ?client_id=YOUR_CLIENT_ID
   &redirect_uri=http://localhost:8000/auth/gmail/callback
   &scope=https://www.googleapis.com/auth/gmail.readonly
   &response_type=code

3. Google shows the user a permissions screen:
   "ClawdBot wants to read your Gmail"
   [Allow] [Deny]

4. User clicks Allow. Google redirects back to:
   http://localhost:8000/auth/gmail/callback?code=4/ABC123...

5. FastAPI backend exchanges the code for tokens:
   POST https://oauth2.googleapis.com/token
   { code: "4/ABC123...", client_id, client_secret, redirect_uri }
   → { access_token: "ya29...", refresh_token: "1//...", expires_in: 3600 }

6. Store refresh_token in database (encrypted).
   Use access_token to call Gmail API.
   When access_token expires (after 1 hour), use refresh_token to get a new one.
```

```python
# api/auth.py — Gmail OAuth endpoints

GMAIL_SCOPES = [
    "https://www.googleapis.com/auth/gmail.readonly",
    "https://www.googleapis.com/auth/gmail.modify",  # Needed to mark emails as read
]

@router.get("/auth/gmail/start")
async def gmail_oauth_start(current_user: User = Depends(get_current_user)):
    """Redirect the user to Google's OAuth consent screen."""
    from google_auth_oauthlib.flow import Flow

    flow = Flow.from_client_config(
        {
            "web": {
                "client_id": settings.GOOGLE_CLIENT_ID,
                "client_secret": settings.GOOGLE_CLIENT_SECRET,
                "redirect_uris": [settings.GOOGLE_REDIRECT_URI],
                "auth_uri": "https://accounts.google.com/o/oauth2/auth",
                "token_uri": "https://oauth2.googleapis.com/token",
            }
        },
        scopes=GMAIL_SCOPES,
        redirect_uri=settings.GOOGLE_REDIRECT_URI,
    )

    auth_url, state = flow.authorization_url(
        access_type="offline",      # Gets a refresh_token
        include_granted_scopes="true",
        state=str(current_user.id)  # We'll verify this in the callback
    )

    return {"auth_url": auth_url}

@router.get("/auth/gmail/callback")
async def gmail_oauth_callback(
    code: str,
    state: str,
    db: Session = Depends(get_db)
):
    """
    Google redirects here after the user grants permission.
    Exchange the authorization code for tokens and save them.
    """
    from google_auth_oauthlib.flow import Flow
    from cryptography.fernet import Fernet

    user_id = int(state)

    flow = Flow.from_client_config(...)
    flow.fetch_token(code=code)
    credentials = flow.credentials

    # Encrypt the refresh token before storing
    # (Never store tokens in plain text — treat them like passwords)
    fernet = Fernet(settings.ENCRYPTION_KEY)
    encrypted_refresh_token = fernet.encrypt(
        credentials.refresh_token.encode()
    ).decode()

    # Save to database
    gmail_cred = GmailCredential(
        user_id=user_id,
        access_token=credentials.token,
        encrypted_refresh_token=encrypted_refresh_token,
        token_expiry=credentials.expiry,
        connected=True,
    )
    db.merge(gmail_cred)
    db.commit()

    return RedirectResponse(url="/dashboard?gmail_connected=true")
```

---

### What We Check For

We look for four kinds of job-related emails:

| Category | Examples | Importance |
|---|---|---|
| `interview_invite` | "We'd like to schedule a call", "Interview invitation" | Urgent |
| `application_received` | "Thanks for applying to...", "We received your application" | Medium |
| `rejection` | "We've decided to move forward with other candidates" | High (close the loop) |
| `offer` | "We'd like to extend an offer", "Offer letter attached" | Urgent |
| `assessment` | "Complete this coding challenge", "HackerRank invitation" | High |
| `general_job` | Recruiter outreach, job alert digests | Low |

---

### The Email Filtering Pipeline — Step by Step

```
┌────────────────────────────────────────────────────────────────────────┐
│  EMAIL MONITORING PIPELINE                                             │
│                                                                        │
│  1. Celery Beat triggers email check every 15 minutes                  │
│     (or: Gmail Push Notification arrives via Pub/Sub webhook)          │
│         │                                                              │
│         ▼                                                              │
│  2. Pull Gmail credentials for this user (decrypt refresh token)       │
│         │                                                              │
│         ▼                                                              │
│  3. Call Gmail API: list new messages since last_checked timestamp     │
│         │                                                              │
│         ▼                                                              │
│  4. For each new email (parallel processing):                          │
│     a) Get: subject, sender, body preview (first 200 chars)           │
│     b) Check: have we processed this email_id before?                 │
│        If yes → skip (idempotency)                                    │
│        If no → continue                                               │
│         │                                                              │
│         ▼                                                              │
│  5. Send to Claude Haiku:                                              │
│     "Is this job-related? If yes, what category and importance?"       │
│         │                                                              │
│         ▼                                                              │
│  6. If job_related = true AND importance in (urgent, high):           │
│     → Create Notification record in database                           │
│     → If interview_invite: also create CalendarEvent suggestion        │
│         │                                                              │
│         ▼                                                              │
│  7. Frontend polls GET /api/notifications every 30 seconds             │
│     → Shows badge count on bell icon                                   │
│     → Shows notification panel with categorized emails                 │
└────────────────────────────────────────────────────────────────────────┘
```

#### Option A: Polling (simpler, recommended for v1)

```python
# src/tasks/email_tasks.py

@shared_task
def check_new_emails(user_id: int):
    """
    Poll Gmail for new emails and classify them.
    Called by Celery Beat every 15 minutes.
    """
    db = SessionLocal()
    try:
        # 1. Get Gmail credentials
        cred = db.query(GmailCredential).filter_by(user_id=user_id, connected=True).first()
        if not cred:
            return  # User hasn't connected Gmail

        # 2. Build Gmail API service
        service = build_gmail_service(cred)  # Uses stored tokens

        # 3. Get last check time
        state = db.query(EmailCheckState).filter_by(user_id=user_id).first()
        since = state.last_checked if state else "now-1d"  # Default: last 24h

        # 4. List new messages
        results = service.users().messages().list(
            userId="me",
            q=f"after:{since} -from:me",  # New emails, not sent by self
            maxResults=50
        ).execute()

        messages = results.get("messages", [])

        for msg_ref in messages:
            process_single_email.delay(user_id=user_id, message_id=msg_ref["id"])

        # 5. Update last check time
        if not state:
            state = EmailCheckState(user_id=user_id)
            db.add(state)
        state.last_checked = datetime.utcnow()
        db.commit()

    finally:
        db.close()


@shared_task
def process_single_email(user_id: int, message_id: str):
    """
    Process a single email: classify with Claude, save notification if important.
    """
    db = SessionLocal()
    try:
        # Idempotency: skip if already processed
        if db.query(ProcessedEmail).filter_by(
            user_id=user_id, gmail_message_id=message_id
        ).first():
            return

        # Get email details from Gmail API
        cred = db.query(GmailCredential).filter_by(user_id=user_id).first()
        service = build_gmail_service(cred)
        msg = service.users().messages().get(
            userId="me", id=message_id, format="metadata",
            metadataHeaders=["From", "Subject", "Date"]
        ).execute()

        # Extract just what we need — never store full email
        headers = {h["name"]: h["value"] for h in msg["payload"]["headers"]}
        subject = headers.get("Subject", "(No subject)")
        sender  = headers.get("From", "Unknown sender")

        # Get snippet (Gmail's first ~100 chars preview)
        snippet = msg.get("snippet", "")[:200]

        # Classify with Claude
        classification = classify_email(subject, sender, snippet)

        # Mark as processed (so we don't re-process on next poll)
        db.add(ProcessedEmail(user_id=user_id, gmail_message_id=message_id))

        # Save notification only if job-related and important enough
        if classification["is_job_related"] and classification["importance"] in ("urgent", "high", "medium"):
            notification = Notification(
                user_id=user_id,
                type=classification["category"],
                title=f"{classification['category'].replace('_', ' ').title()}: {subject[:80]}",
                body=classification["reason"],
                gmail_message_id=message_id,  # Reference back to Gmail
                sender=sender,
                importance=classification["importance"],
                action_required=classification["action_required"],
                read=False,
                created_at=datetime.utcnow(),
            )
            db.add(notification)

        db.commit()

    finally:
        db.close()
```

#### Option B: Gmail Push Notifications (advanced, near-real-time)

Instead of polling every 15 minutes, Gmail can *push* a notification to your server
the moment a new email arrives. This requires Google Cloud Pub/Sub.

```
Setup steps:
1. Create a Google Cloud Pub/Sub topic: projects/YOUR_PROJECT/topics/gmail-notifications
2. Give Gmail permission to publish to your topic
3. Create a subscription that pushes to your endpoint: POST /api/webhooks/gmail
4. Call Gmail API: users.watch() to register the push subscription
5. Handle incoming Pub/Sub messages at /api/webhooks/gmail

This is more complex to set up but gives < 1 second notification delivery.
Recommended for v2 — start with polling for v1.
```

---

### Email Categories & Notification Schema

```python
# src/schemas/notification.py
from pydantic import BaseModel
from typing import Optional
from datetime import datetime
from enum import Enum

class NotificationCategory(str, Enum):
    interview_invite      = "interview_invite"
    application_received  = "application_received"
    rejection             = "rejection"
    offer                 = "offer"
    assessment            = "assessment"
    general_job           = "general_job"

class ImportanceLevel(str, Enum):
    urgent = "urgent"
    high   = "high"
    medium = "medium"
    low    = "low"

class NotificationSchema(BaseModel):
    """
    What a notification looks like when returned to the frontend.
    """
    id:              int
    user_id:         int
    type:            NotificationCategory
    title:           str                   # Short display title
    body:            str                   # Claude's reason / summary
    gmail_message_id: Optional[str]        # Gmail's message ID (for deep-linking)
    sender:          Optional[str]         # Who sent the email
    importance:      ImportanceLevel
    action_required: bool
    read:            bool
    created_at:      datetime

    # We do NOT store: full email body, attachments, CC list
    # Privacy: minimal data principle

    class Config:
        from_attributes = True
        use_enum_values = True
```

```python
# api/notifications.py — Frontend polling endpoint

@router.get("/notifications", response_model=list[NotificationSchema])
async def get_notifications(
    unread_only: bool = False,
    limit: int = 50,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Returns the user's notifications.
    Frontend polls this every 30 seconds to update the bell icon badge.
    """
    query = db.query(Notification).filter_by(user_id=current_user.id)

    if unread_only:
        query = query.filter_by(read=False)

    notifications = (
        query
        .order_by(Notification.created_at.desc())
        .limit(limit)
        .all()
    )
    return notifications


@router.patch("/notifications/{notification_id}/read")
async def mark_notification_read(
    notification_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Mark a notification as read when the user clicks on it."""
    notification = db.query(Notification).filter_by(
        id=notification_id, user_id=current_user.id
    ).first()

    if not notification:
        raise HTTPException(status_code=404)

    notification.read = True
    db.commit()
    return {"ok": True}
```

---

### Privacy Policy: Minimal Data Storage

We only store metadata from emails, never the full content. This is important for:
1. **User trust** — you're accessing sensitive personal email
2. **Legal compliance** — minimizes liability under GDPR/CCPA
3. **Storage costs** — emails can be MB-sized; metadata is bytes

```
What we store:          What we DO NOT store:
✓ subject (first 80 chars)   ✗ Full email body
✓ sender name/email          ✗ Email attachments
✓ our classification         ✗ CC/BCC recipients
✓ Gmail message ID           ✗ Full email thread
✓ notification title/body    ✗ Linked documents
  (Claude's summary, ~50 words)
```
