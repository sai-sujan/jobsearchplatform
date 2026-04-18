# 03 — Backend Architecture

ClawdBot's backend is the engine room. It receives requests from the React frontend,
talks to the database, sends jobs to background workers, calls the Claude API, and
returns data. This document explains every moving part in plain English.

---

## 1. Tech Stack

### FastAPI
FastAPI is a Python web framework for building APIs. Think of it as a switchboard
operator: HTTP requests come in, FastAPI routes them to the right Python function,
that function does work and returns a response.

Why FastAPI over Flask/Django?
- Automatic documentation at `/docs` (Swagger UI) — huge for debugging
- Built-in request validation via Pydantic — bad data is rejected before it reaches your logic
- Async support — the server can handle many requests at once without waiting
- Type hints everywhere — your IDE catches bugs before you run the code

### SQLAlchemy ORM
ORM stands for Object Relational Mapper. Instead of writing raw SQL strings like
`SELECT * FROM jobs WHERE id = 5`, you write Python like `db.query(Job).filter(Job.id == 5).first()`.

SQLAlchemy translates your Python into the correct SQL for whatever database you use.
This means if you ever switch from PostgreSQL to another database, most of your code
stays the same.

### Alembic Migrations
When your app evolves, you need to change the database schema — add a column,
rename a table, add an index. Alembic tracks these changes as numbered migration
files (like Git commits for your database). You can move forward (upgrade) or
backward (downgrade) between versions. Running `alembic upgrade head` applies
all pending changes to the live database safely.

### Celery + Redis (Background Jobs)
Some tasks take too long to do inside an HTTP request. Scraping 500 job listings
might take 2 minutes — you cannot make the user wait that long for a response.

Celery is a task queue system. You define a task (a Python function) and tell
Celery to run it in the background. Redis acts as the message broker — it is the
waiting room where task requests sit until a Celery worker picks them up.

Flow: API receives request → API drops a task message into Redis → API immediately
returns "task started" → Celery worker picks up the message → worker does the
slow work → worker writes results to the database.

### Pydantic Validation
Pydantic is a data validation library. You define a schema (e.g., "a job must
have a title string and a salary integer greater than zero") and Pydantic
automatically checks every incoming request against that schema. If validation
fails, FastAPI returns a 422 error with a clear message explaining exactly what
was wrong and where.

---

## 2. Complete Folder Structure

```
backend/
│
├── app/
│   │
│   ├── api/                        # HTTP route handlers ("controllers")
│   │   ├── __init__.py
│   │   ├── deps.py                 # Shared dependencies: get current user, get db session
│   │   └── v1/
│   │       ├── __init__.py
│   │       ├── router.py           # Combines all route groups into one router
│   │       ├── auth.py             # POST /login, POST /register, POST /refresh
│   │       ├── jobs.py             # GET/POST/DELETE /jobs and /jobs/{id}
│   │       ├── resumes.py          # Upload resume, list resumes, score resume
│   │       ├── applications.py     # Track which jobs you applied to
│   │       ├── notifications.py    # GET /notifications, PATCH mark-as-read
│   │       ├── scraping.py         # POST trigger scrape, GET scrape run history
│   │       └── email_sync.py       # POST connect Gmail, GET email threads
│   │
│   ├── core/                       # App-wide configuration and utilities
│   │   ├── __init__.py
│   │   ├── config.py               # Reads environment variables (DATABASE_URL, etc.)
│   │   ├── security.py             # JWT creation/verification, password hashing
│   │   ├── database.py             # SQLAlchemy engine and session factory
│   │   ├── celery_app.py           # Celery instance with Redis broker config
│   │   └── logging_config.py       # Structured JSON logging setup
│   │
│   ├── models/                     # SQLAlchemy table definitions (Python classes = DB tables)
│   │   ├── __init__.py
│   │   ├── user.py                 # users table
│   │   ├── resume.py               # resumes table
│   │   ├── job.py                  # jobs table
│   │   ├── application.py          # job_applications table
│   │   ├── scraping_run.py         # scraping_runs table
│   │   ├── email_message.py        # email_messages table
│   │   ├── notification.py         # notifications table
│   │   └── llm_cache.py            # llm_cache table
│   │
│   ├── schemas/                    # Pydantic request/response shapes
│   │   ├── __init__.py
│   │   ├── auth.py                 # LoginRequest, TokenResponse, RegisterRequest
│   │   ├── job.py                  # JobCreate, JobRead, JobListResponse
│   │   ├── resume.py               # ResumeUpload, ResumeRead, ResumeScoreResponse
│   │   ├── application.py          # ApplicationCreate, ApplicationRead, StatusUpdate
│   │   ├── notification.py         # NotificationRead, MarkReadRequest
│   │   ├── scraping.py             # ScrapeRequest, ScrapeRunRead
│   │   └── email_sync.py           # EmailConnectRequest, EmailThreadRead
│   │
│   ├── services/                   # Business logic (no HTTP, no DB queries — pure logic)
│   │   ├── __init__.py
│   │   ├── job_service.py          # Filter/search jobs, deduplicate listings
│   │   ├── resume_service.py       # Parse PDF, extract text, store file
│   │   ├── scoring_service.py      # Call Claude to score resume vs job description
│   │   ├── scraping_service.py     # Playwright browser automation, parse HTML
│   │   ├── email_service.py        # Gmail OAuth, parse threads, detect replies
│   │   ├── notification_service.py # Create/dispatch notifications
│   │   └── llm_service.py          # Claude API wrapper: caching, retries, cost tracking
│   │
│   ├── workers/                    # Celery task definitions
│   │   ├── __init__.py
│   │   ├── scraping_tasks.py       # scrape_job_boards(), process_raw_listings()
│   │   ├── scoring_tasks.py        # score_resume_against_job(), batch_score_all()
│   │   ├── email_tasks.py          # sync_gmail_inbox(), classify_email_thread()
│   │   └── notification_tasks.py   # send_digest_email(), purge_old_notifications()
│   │
│   └── main.py                     # FastAPI app creation, middleware, startup events
│
├── migrations/                     # Alembic migration files
│   ├── env.py                      # Alembic config: how to connect to DB
│   ├── script.py.mako              # Template for new migration files
│   └── versions/
│       ├── 0001_create_users.py
│       ├── 0002_create_jobs.py
│       └── ...
│
├── tests/
│   ├── conftest.py                 # Pytest fixtures: test DB, test client, fake user
│   ├── test_auth.py
│   ├── test_jobs.py
│   ├── test_scraping.py
│   └── test_scoring.py
│
├── .env                            # Environment variables (never commit this)
├── .env.example                    # Template showing which vars are needed
├── alembic.ini                     # Alembic config file
├── Dockerfile
├── docker-compose.yml              # Runs backend + PostgreSQL + Redis together
└── requirements.txt
```

---

## 3. All API Endpoints

Every path is prefixed with `/api/v1`. Authentication uses a Bearer token in the
`Authorization` header: `Authorization: Bearer <your_jwt_token>`.

### Authentication

| Method | Path | What it does | Request Body | Response | Auth Required? |
|--------|------|--------------|--------------|----------|---------------|
| POST | `/auth/register` | Create a new user account | `{ email, password, full_name }` | `{ user_id, email, access_token, refresh_token }` | No |
| POST | `/auth/login` | Log in with email + password | `{ email, password }` | `{ access_token, refresh_token, expires_in }` | No |
| POST | `/auth/refresh` | Get a new access token using refresh token | `{ refresh_token }` | `{ access_token, expires_in }` | No |
| POST | `/auth/logout` | Invalidate the current refresh token | None | `{ message: "logged out" }` | Yes |
| GET | `/auth/me` | Get current user profile | None | `{ user_id, email, full_name, created_at }` | Yes |
| PATCH | `/auth/me` | Update profile (name, preferences) | `{ full_name?, email_notifications? }` | Updated user object | Yes |
| POST | `/auth/change-password` | Change password | `{ current_password, new_password }` | `{ message: "password updated" }` | Yes |

### Jobs

| Method | Path | What it does | Request Body | Response | Auth Required? |
|--------|------|--------------|--------------|----------|---------------|
| GET | `/jobs` | List jobs with filters and pagination | Query params: `page, limit, location, remote_only, min_salary, keyword, source` | `{ jobs: [...], total, page, pages }` | Yes |
| GET | `/jobs/{job_id}` | Get full details of one job | None | Full job object with description, company info | Yes |
| POST | `/jobs` | Manually add a job listing | `{ title, company, location, description, url, salary_min?, salary_max? }` | Created job object | Yes |
| DELETE | `/jobs/{job_id}` | Remove a job from your list | None | `{ message: "deleted" }` | Yes |
| GET | `/jobs/{job_id}/score` | Get AI match score for a specific resume | Query param: `resume_id` | `{ score: 87, breakdown: {...}, suggestions: [...] }` | Yes |
| POST | `/jobs/{job_id}/score` | Trigger fresh AI scoring (forces re-score) | `{ resume_id }` | `{ task_id, status: "queued" }` | Yes |
| GET | `/jobs/search` | Full-text search across all jobs | Query param: `q` (search string) | Same as GET /jobs | Yes |

### Resumes

| Method | Path | What it does | Request Body | Response | Auth Required? |
|--------|------|--------------|--------------|----------|---------------|
| GET | `/resumes` | List all resumes for current user | None | `[{ resume_id, name, created_at, file_size }]` | Yes |
| POST | `/resumes` | Upload a new resume (PDF or DOCX) | `multipart/form-data`: `file`, `name?` | `{ resume_id, name, extracted_text_preview }` | Yes |
| GET | `/resumes/{resume_id}` | Get resume metadata and extracted text | None | Full resume object | Yes |
| DELETE | `/resumes/{resume_id}` | Delete a resume | None | `{ message: "deleted" }` | Yes |
| GET | `/resumes/{resume_id}/download` | Download the original file | None | File stream (PDF/DOCX) | Yes |
| POST | `/resumes/{resume_id}/tailor` | Ask Claude to tailor resume for a job | `{ job_id, sections_to_tailor?: [...] }` | `{ task_id, status: "queued" }` | Yes |
| GET | `/resumes/{resume_id}/tailored` | List all tailored versions | None | `[{ version_id, job_title, created_at }]` | Yes |

### Applications

| Method | Path | What it does | Request Body | Response | Auth Required? |
|--------|------|--------------|--------------|----------|---------------|
| GET | `/applications` | List all job applications | Query params: `status, page, limit` | `{ applications: [...], total, stats }` | Yes |
| POST | `/applications` | Record that you applied to a job | `{ job_id, resume_id, status?, notes?, applied_at? }` | Created application object | Yes |
| GET | `/applications/{app_id}` | Get details of one application | None | Full application with job + resume info | Yes |
| PATCH | `/applications/{app_id}` | Update status or notes | `{ status?, notes?, interview_date? }` | Updated application object | Yes |
| DELETE | `/applications/{app_id}` | Remove an application record | None | `{ message: "deleted" }` | Yes |
| GET | `/applications/stats` | Dashboard stats: counts by status | None | `{ applied: 12, interviewing: 3, offers: 1, rejected: 5 }` | Yes |

### Notifications

| Method | Path | What it does | Request Body | Response | Auth Required? |
|--------|------|--------------|--------------|----------|---------------|
| GET | `/notifications` | List all notifications | Query params: `unread_only, page, limit` | `{ notifications: [...], unread_count }` | Yes |
| PATCH | `/notifications/{notif_id}/read` | Mark one notification as read | None | Updated notification | Yes |
| POST | `/notifications/read-all` | Mark all notifications as read | None | `{ message: "all marked read" }` | Yes |
| DELETE | `/notifications/{notif_id}` | Delete a notification | None | `{ message: "deleted" }` | Yes |

### Scraping Triggers

| Method | Path | What it does | Request Body | Response | Auth Required? |
|--------|------|--------------|--------------|----------|---------------|
| POST | `/scraping/trigger` | Start a scraping run immediately | `{ sources?: ["linkedin","indeed","glassdoor"], keywords?: [...], location? }` | `{ task_id, run_id, status: "queued" }` | Yes |
| GET | `/scraping/runs` | List past scraping runs | Query params: `page, limit` | `[{ run_id, status, started_at, jobs_found, duration_seconds }]` | Yes |
| GET | `/scraping/runs/{run_id}` | Get details of one scraping run | None | `{ run_id, status, sources_scraped, errors, jobs: [...] }` | Yes |
| DELETE | `/scraping/runs/{run_id}` | Cancel a running scrape | None | `{ message: "cancellation requested" }` | Yes |

### Email Sync

| Method | Path | What it does | Request Body | Response | Auth Required? |
|--------|------|--------------|--------------|----------|---------------|
| POST | `/email/connect` | Start Gmail OAuth flow | `{ redirect_uri }` | `{ auth_url }` — redirect user to this URL | Yes |
| GET | `/email/callback` | Gmail OAuth callback (Google redirects here) | Query params: `code, state` | Redirects to frontend with success/failure | No |
| DELETE | `/email/disconnect` | Revoke Gmail access | None | `{ message: "disconnected" }` | Yes |
| GET | `/email/status` | Check if Gmail is connected | None | `{ connected: true, email: "...", last_synced_at }` | Yes |
| POST | `/email/sync` | Trigger manual inbox sync | None | `{ task_id, status: "queued" }` | Yes |
| GET | `/email/threads` | List classified email threads | Query params: `application_id?, page, limit` | `[{ thread_id, subject, from, classification, matched_company }]` | Yes |

---

## 4. Background Jobs (Celery Tasks)

Background jobs are defined in `app/workers/`. Each task is a Python function
decorated with `@celery_app.task`. When you call `.delay()` or `.apply_async()`
on a task, Celery drops a message into Redis and a worker process picks it up.

---

### Task: `scrape_job_boards`

**File:** `app/workers/scraping_tasks.py`

**When triggered:**
- User clicks "Scrape Now" in the UI → POST `/scraping/trigger`
- Celery Beat scheduler runs it automatically every 6 hours

**Step by step:**
1. Create a `scraping_runs` row in the database with `status = "running"`
2. For each source in the run config (LinkedIn, Indeed, Glassdoor):
   a. Launch a headless Playwright browser
   b. Navigate to the search URL with the user's keywords and location
   c. Scroll/paginate to collect up to 200 listing cards
   d. For each card: extract title, company, location, URL, salary if visible
   e. Close the browser
3. Deduplicate against existing jobs (check by URL)
4. Bulk insert new jobs into the `jobs` table
5. Update the `scraping_runs` row: `status = "completed"`, `jobs_found = N`
6. Call `score_new_jobs.delay()` to queue scoring for the new listings
7. Create a notification: "Scrape complete — 47 new jobs found"

**Typical duration:** 90 seconds to 5 minutes depending on sources and network speed

**Failure handling:**
- Each source is wrapped in try/except — one source failing does not stop others
- Playwright timeout (30s per page) prevents hanging indefinitely
- On complete failure: update run `status = "failed"`, save `error_message`
- Celery retry: auto-retry up to 2 times with 60s delay before marking failed
- Dead letter: after all retries exhausted, log to Sentry and create a failure notification

---

### Task: `process_raw_listings`

**File:** `app/workers/scraping_tasks.py`

**When triggered:** Called by `scrape_job_boards` after collecting raw HTML data

**Step by step:**
1. Receive a list of raw scraped dicts `[{ raw_html, source, url }]`
2. For each item, use Beautiful Soup to extract structured fields
3. Normalize: standardize location strings ("New York, NY" → consistent format)
4. Detect remote jobs from description keywords ("remote", "work from home", etc.)
5. Extract salary ranges from description text using regex patterns
6. Save clean records to the `jobs` table
7. Return count of successfully processed items

**Typical duration:** 10–30 seconds for 200 listings

**Failure handling:** Bad records are logged and skipped; bulk insert ignores duplicates via `ON CONFLICT DO NOTHING`

---

### Task: `score_resume_against_job`

**File:** `app/workers/scoring_tasks.py`

**When triggered:**
- User requests a score via POST `/jobs/{job_id}/score`
- Automatically after a scrape run completes (for user's active resume)

**Step by step:**
1. Load job description from `jobs` table
2. Load resume extracted text from `resumes` table
3. Check `llm_cache` table — if this exact job+resume combo was scored in the last 7 days, return cached result immediately (skip Claude API call)
4. Build the scoring prompt (see Section 6 for template)
5. Call Claude API with `claude-3-5-haiku` model (cheaper, fast)
6. Parse the JSON response: `{ score: 0-100, breakdown: {...}, missing_keywords: [...], suggestions: [...] }`
7. Save score to `job_applications` table if an application exists, or to a standalone scores table
8. Save result to `llm_cache` table for future cache hits
9. Create a notification if score is above 80: "Strong match found: {job_title} at {company}"

**Typical duration:** 5–15 seconds (mostly waiting for Claude API)

**Failure handling:**
- Claude API timeout (30s): retry once, then return `score = null` with `status = "scoring_failed"`
- Claude API rate limit (429): exponential backoff, retry up to 3 times
- JSON parse error: log malformed response, return error status

---

### Task: `batch_score_all`

**File:** `app/workers/scoring_tasks.py`

**When triggered:** After a scraping run, or when user uploads a new resume

**Step by step:**
1. Query all jobs from last 30 days that have not been scored against user's active resume
2. Split into batches of 10
3. For each batch, dispatch 10 parallel `score_resume_against_job` tasks using `group()`
4. Use Celery `chord` to run a callback when all batch tasks complete
5. Callback creates a summary notification: "Scored 45 jobs. 8 strong matches found."

**Typical duration:** 2–10 minutes depending on number of jobs

**Failure handling:** Individual task failures within the batch do not stop others; final count reports how many succeeded

---

### Task: `tailor_resume_for_job`

**File:** `app/workers/scoring_tasks.py`

**When triggered:** User clicks "Tailor Resume" → POST `/resumes/{id}/tailor`

**Step by step:**
1. Load full resume text and job description
2. Build tailoring prompt (see Section 6)
3. Call Claude API with `claude-3-5-sonnet` model (better writing quality needed here)
4. Receive tailored bullet points and summary suggestions
5. Save tailored content as a new record linked to the original resume and the job
6. Create notification: "Tailored resume ready for {job_title}"

**Typical duration:** 20–45 seconds

**Failure handling:** Save original resume text as fallback; notify user if tailoring failed

---

### Task: `sync_gmail_inbox`

**File:** `app/workers/email_tasks.py`

**When triggered:**
- User clicks "Sync Email" → POST `/email/sync`
- Celery Beat runs it every 30 minutes for users with Gmail connected

**Step by step:**
1. Load user's Gmail OAuth tokens from the database
2. Refresh token if expired (Google OAuth refresh flow)
3. Call Gmail API: fetch threads with label `INBOX` modified since `last_synced_at`
4. For each thread:
   a. Fetch full thread with all messages
   b. Extract: subject, sender, date, snippet, body text
5. Save raw threads to `email_messages` table
6. Dispatch `classify_email_thread.delay(thread_id)` for each new thread
7. Update `last_synced_at` timestamp for the user

**Typical duration:** 5–30 seconds depending on inbox size

**Failure handling:** Token refresh failure → mark Gmail as disconnected, create notification asking user to reconnect

---

### Task: `classify_email_thread`

**File:** `app/workers/email_tasks.py`

**When triggered:** Called by `sync_gmail_inbox` for each new email thread

**Step by step:**
1. Load email subject + body text
2. Call Claude API: "Classify this email. Is it a job application response? If yes, is it an interview invite, rejection, offer, or follow-up request? Also extract the company name and job title."
3. Parse classification result
4. If job-related: attempt to match to an existing `job_applications` record by company name
5. If matched: update application status (e.g., `status = "interviewing"`)
6. Create notification based on classification (e.g., "Interview invite from Google!")
7. Save classification result to `email_messages.classification` column

**Typical duration:** 5–10 seconds

**Failure handling:** Classification errors default to `classification = "unknown"`; email is still saved

---

### Task: `send_digest_email`

**File:** `app/workers/notification_tasks.py`

**When triggered:** Celery Beat runs every day at 8:00 AM in user's timezone

**Step by step:**
1. Fetch all users with `email_notifications = true`
2. For each user, fetch: unread notifications from last 24h, new strong matches (score > 80), upcoming interviews
3. If nothing notable, skip sending
4. Render HTML email template with summary
5. Send via SendGrid API
6. Log send event

**Typical duration:** 1–5 minutes for all users

---

## 5. Authentication

### The Analogy
Think of authentication like a concert. To get in, you show your ticket at the gate
(login). The gate gives you a wristband (JWT token). After that, every time you
want to access something inside the venue (any API endpoint), you just show your
wristband — they do not need to check your ticket again. Wristbands expire after a
few hours (access token expiry). Your ticket stub (refresh token) lets you get a
new wristband without re-entering the full queue.

### JWT (JSON Web Token)
A JWT is a string that looks like: `xxxxx.yyyyy.zzzzz`

Three parts separated by dots:
1. **Header** — algorithm used (we use HS256)
2. **Payload** — the data inside: `{ user_id: 42, email: "...", exp: 1700000000 }`
3. **Signature** — a cryptographic hash of header + payload using a secret key

The server never stores the token. It just checks the signature when it arrives.
If the signature is valid and the token is not expired, the user is authenticated.

### Token Storage and Refresh

**Access token:**
- Short-lived: expires in 15 minutes
- Stored in browser memory (not localStorage — localStorage is vulnerable to XSS attacks)
- Sent with every API request in the `Authorization: Bearer <token>` header

**Refresh token:**
- Long-lived: expires in 30 days
- Stored in an HTTP-only cookie (JavaScript cannot read this — protects against XSS)
- Used only to call `POST /auth/refresh` and get a new access token
- On the server, stored in a `refresh_tokens` database table so it can be invalidated on logout

**Refresh flow:**
1. Frontend makes an API call — gets 401 Unauthorized
2. Frontend automatically calls `POST /auth/refresh` with the cookie
3. Server validates the refresh token in the database
4. Server returns a new access token
5. Frontend retries the original request with the new token
6. User notices nothing — seamless experience

### Password Hashing
Passwords are never stored in plain text. We use `bcrypt` via `passlib`.

When a user registers: `hash = bcrypt.hash("my_password123")` → stored in database
When a user logs in: `bcrypt.verify("my_password123", stored_hash)` → returns True/False

Bcrypt is deliberately slow (configurable "cost factor"). This means even if an
attacker steals your database, brute-forcing the hashes takes years.

### Implementation in Code

```python
# app/core/security.py

from datetime import datetime, timedelta
from jose import JWTError, jwt
from passlib.context import CryptContext
from app.core.config import settings

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

def hash_password(password: str) -> str:
    return pwd_context.hash(password)

def verify_password(plain: str, hashed: str) -> bool:
    return pwd_context.verify(plain, hashed)

def create_access_token(user_id: int) -> str:
    expire = datetime.utcnow() + timedelta(minutes=15)
    payload = {"sub": str(user_id), "exp": expire, "type": "access"}
    return jwt.encode(payload, settings.SECRET_KEY, algorithm="HS256")

def decode_token(token: str) -> dict:
    return jwt.decode(token, settings.SECRET_KEY, algorithms=["HS256"])
```

```python
# app/api/deps.py — the "get current user" dependency

from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from app.core.security import decode_token
from app.core.database import get_db

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/v1/auth/login")

def get_current_user(token: str = Depends(oauth2_scheme), db = Depends(get_db)):
    try:
        payload = decode_token(token)
        user_id = int(payload["sub"])
    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid token")
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    return user
```

Any route that needs authentication just adds `current_user = Depends(get_current_user)` to its parameters.

---

## 6. Claude API Integration

### Model Selection Strategy
Different tasks have different quality/cost tradeoffs:

| Task | Model | Why |
|------|-------|-----|
| Resume scoring (yes/no + number) | `claude-3-5-haiku-20241022` | Fast, cheap, sufficient for scoring |
| Job matching explanation | `claude-3-5-haiku-20241022` | Short output needed |
| Resume tailoring | `claude-3-5-sonnet-20241022` | Quality writing matters here |
| Email classification | `claude-3-haiku-20240307` | Very simple task, cheapest option |

### Prompt Caching
Claude supports prompt caching — if you send the same large system prompt with
`cache_control: {"type": "ephemeral"}`, subsequent calls that share that prefix
cost 90% less. Cache lives for 5 minutes.

For ClawdBot, the scoring system prompt (about 1,000 tokens) is cached. Each
scoring call then only pays for the unique job description + resume tokens.

```python
# app/services/llm_service.py

import anthropic
from app.core.config import settings

client = anthropic.Anthropic(api_key=settings.ANTHROPIC_API_KEY)

SCORING_SYSTEM_PROMPT = """
You are an expert technical recruiter and resume reviewer. Your job is to evaluate
how well a candidate's resume matches a job description. You score on a scale of
0–100 where:
- 90–100: Exceptional match, apply immediately
- 70–89: Strong match, very likely to get an interview
- 50–69: Moderate match, worth applying
- 30–49: Weak match, significant gaps
- 0–29: Poor match, missing core requirements

Always respond with valid JSON only. No markdown, no explanation outside the JSON.
"""

def score_resume(resume_text: str, job_description: str) -> dict:
    response = client.messages.create(
        model="claude-3-5-haiku-20241022",
        max_tokens=1024,
        system=[
            {
                "type": "text",
                "text": SCORING_SYSTEM_PROMPT,
                "cache_control": {"type": "ephemeral"}   # cache this system prompt
            }
        ],
        messages=[
            {
                "role": "user",
                "content": SCORE_USER_TEMPLATE.format(
                    resume=resume_text[:4000],      # cap to avoid huge costs
                    job_description=job_description[:3000]
                )
            }
        ]
    )
    return parse_json_response(response.content[0].text)
```

### Resume Scoring Prompt Template

```python
SCORE_USER_TEMPLATE = """
JOB DESCRIPTION:
---
{job_description}
---

CANDIDATE RESUME:
---
{resume}
---

Evaluate this candidate for this job. Return JSON with this exact structure:
{{
  "score": <integer 0-100>,
  "breakdown": {{
    "technical_skills": <integer 0-100>,
    "experience_level": <integer 0-100>,
    "education": <integer 0-100>,
    "domain_knowledge": <integer 0-100>
  }},
  "matching_keywords": [<list of keywords from resume that match the job>],
  "missing_keywords": [<important keywords from the job not in the resume>],
  "summary": "<2-3 sentence plain English explanation of the match>",
  "suggestions": [<up to 3 specific things the candidate could add or improve>]
}}
"""
```

### Resume Tailoring Prompt Template

```python
TAILOR_TEMPLATE = """
You are helping a job seeker tailor their resume for a specific job.

JOB TITLE: {job_title}
COMPANY: {company}

JOB DESCRIPTION:
---
{job_description}
---

ORIGINAL RESUME:
---
{resume_text}
---

Rewrite the resume's summary and top 5 bullet points to better align with this job.
- Keep all facts truthful — do not invent experience
- Use keywords from the job description where they genuinely apply
- Emphasize relevant achievements
- Use strong action verbs

Return JSON:
{{
  "tailored_summary": "<2-3 sentence professional summary>",
  "tailored_bullets": [
    "<bullet 1>",
    "<bullet 2>",
    "<bullet 3>",
    "<bullet 4>",
    "<bullet 5>"
  ],
  "keywords_added": [<list of job keywords now incorporated>],
  "notes": "<brief explanation of changes made>"
}}
"""
```

### Job Matching Prompt Template

```python
MATCH_EXPLANATION_TEMPLATE = """
A candidate is looking for a job. Explain in plain English whether this job is a 
good fit for them.

CANDIDATE PROFILE (from resume):
Skills: {skills_list}
Years of experience: {years_exp}
Current/most recent title: {current_title}

JOB:
Title: {job_title}
Company: {company}
Description summary: {job_summary}

In 3-4 sentences, explain:
1. Why this is or is not a good match
2. One thing that makes them stand out for this role
3. One potential concern the hiring manager might have

Be direct and honest. This helps the candidate decide whether to invest time applying.
"""
```

### Cost Optimization

1. **Cache first:** Before any Claude call, check the `llm_cache` table. Cache key
   is `sha256(model + prompt_text)`. Cache TTL is 7 days for scoring, 30 days for classification.

2. **Truncate inputs:** Resume text capped at 4,000 tokens (~3,000 words). Job descriptions
   capped at 3,000 tokens. Full text is stored in the database; we truncate only for LLM calls.

3. **Cheap model for classification:** Email classification uses `claude-3-haiku` which
   costs ~$0.00025 per 1K tokens. For 1,000 emails per month, cost is under $0.50.

4. **Batch non-urgent tasks:** Scoring happens in Celery workers during off-peak hours
   when possible, not in real-time API calls.

5. **Track costs:** Every LLM call logs `input_tokens`, `output_tokens`, `model`,
   `cost_usd` to the `llm_cache` table. A monthly cost report endpoint lets you
   monitor spend.

### Rate Limiting
Claude API has rate limits (requests per minute, tokens per minute). We handle this with:

```python
# app/services/llm_service.py

import time
from tenacity import retry, stop_after_attempt, wait_exponential, retry_if_exception_type

@retry(
    retry=retry_if_exception_type(anthropic.RateLimitError),
    wait=wait_exponential(multiplier=1, min=4, max=60),   # wait 4s, 8s, 16s, 32s, 60s...
    stop=stop_after_attempt(5)
)
def call_claude_with_retry(model: str, messages: list, system: str) -> str:
    response = client.messages.create(
        model=model,
        max_tokens=1024,
        system=system,
        messages=messages
    )
    return response.content[0].text
```

---

## 7. Error Handling

### Global Exception Handler in FastAPI

FastAPI lets you register exception handlers that catch errors from anywhere in
the application. This means all errors get a consistent JSON format instead of
random HTML error pages.

```python
# app/main.py

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
import logging

logger = logging.getLogger(__name__)
app = FastAPI()

@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    logger.error(
        "Unhandled exception",
        extra={
            "path": request.url.path,
            "method": request.method,
            "error": str(exc),
            "error_type": type(exc).__name__,
        },
        exc_info=True
    )
    return JSONResponse(
        status_code=500,
        content={
            "error": "internal_server_error",
            "message": "Something went wrong. Our team has been notified.",
            "request_id": request.headers.get("X-Request-ID")
        }
    )
```

### Error Response Format
Every error response in the API uses this shape:

```json
{
  "error": "validation_error",
  "message": "The email field is required.",
  "details": [
    { "field": "email", "issue": "field required" }
  ],
  "request_id": "req_abc123"
}
```

This makes it easy for the frontend to display the right error message to users.

### HTTP Status Codes Used

| Code | Meaning | When we use it |
|------|---------|----------------|
| 200 | OK | Successful GET, successful PATCH |
| 201 | Created | Successful POST that creates a resource |
| 204 | No Content | Successful DELETE |
| 400 | Bad Request | Malformed request (e.g., invalid JSON) |
| 401 | Unauthorized | Missing or invalid JWT token |
| 403 | Forbidden | Valid token but not allowed (e.g., accessing another user's data) |
| 404 | Not Found | Resource does not exist |
| 409 | Conflict | Trying to create something that already exists (e.g., duplicate email) |
| 422 | Unprocessable Entity | Pydantic validation failed (missing field, wrong type) |
| 429 | Too Many Requests | Rate limit hit |
| 500 | Internal Server Error | Unexpected crash — bug |
| 503 | Service Unavailable | Database or Redis down |

### Error Propagation: Worker → API → Frontend

Workers (Celery tasks) cannot directly return errors to the HTTP request because
the HTTP request already returned "task queued" and is closed. The flow is:

```
1. Worker fails (e.g., Claude API is down)
        ↓
2. Worker catches exception, logs it with task_id
        ↓
3. Worker updates scraping_run.status = "failed" in database
   and sets scraping_run.error_message = "Claude API timeout after 30s"
        ↓
4. Worker creates a Notification row: type="error", message="Scraping failed. Please try again."
        ↓
5. Frontend polls GET /notifications every 30 seconds
        ↓
6. Frontend receives the error notification and shows it as a toast alert
```

For tasks where the user is actively waiting (e.g., resume tailoring), the frontend
polls `GET /tasks/{task_id}` every 3 seconds until `status` is `"complete"` or `"failed"`.

### Logging Strategy

We use Python's built-in `logging` module configured to output structured JSON.
Structured logs (JSON instead of plain text) can be easily searched and filtered
in log aggregation tools like Datadog, Papertrail, or AWS CloudWatch.

```python
# app/core/logging_config.py

import logging
import json
from datetime import datetime

class JSONFormatter(logging.Formatter):
    def format(self, record):
        log_data = {
            "timestamp": datetime.utcnow().isoformat(),
            "level": record.levelname,
            "logger": record.name,
            "message": record.getMessage(),
            "module": record.module,
            "function": record.funcName,
        }
        if record.exc_info:
            log_data["exception"] = self.formatException(record.exc_info)
        if hasattr(record, "extra"):
            log_data.update(record.extra)
        return json.dumps(log_data)
```

**Log levels used:**
- `DEBUG` — detailed trace info during development (disabled in production)
- `INFO` — normal operations: "Scrape started for user 42", "Email sync complete"
- `WARNING` — something unexpected but not breaking: "Retry attempt 2 for Claude API"
- `ERROR` — something broke but the app is still running: "Task failed after 3 retries"
- `CRITICAL` — the app is going down: "Cannot connect to database"

Every log line includes: timestamp, log level, the function that logged it, and any
relevant IDs (user_id, job_id, task_id) so you can trace a single user's request
through all the log lines it generated.
