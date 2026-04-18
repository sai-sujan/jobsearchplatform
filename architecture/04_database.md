# 04 — Database Architecture

The database is where everything lives permanently. This document explains every
table, every column, how they connect, and how to query them efficiently.

---

## 1. Database Choice: PostgreSQL

### Why PostgreSQL and not SQLite or MongoDB?

**SQLite** is a file-based database — perfect for tiny apps and testing. But it
has one major limitation: only one writer at a time. ClawdBot has Celery workers,
FastAPI servers, and multiple users all writing simultaneously. SQLite would
create a traffic jam and corrupt data. Rule it out.

**MongoDB** is a document database — data is stored as JSON blobs without fixed
columns. This sounds flexible, but it creates problems:
- No joins: to get a job with its applications and the applicant's resume, you
  need 3 separate queries and assemble them in Python. PostgreSQL does this in
  one query.
- No schema enforcement: a scraping bug could save `salary: "not disclosed"` in
  one row and `salary: 75000` in the next. Your code breaks.
- Weaker consistency guarantees: if a Celery worker crashes mid-write, you could
  get half-written documents.

**PostgreSQL** wins because:
- ACID transactions: if your code crashes mid-operation, the database rolls back
  automatically. Your data stays consistent.
- JOINs: get related data across multiple tables in one SQL query
- Full-text search: built-in `tsvector`/`tsquery` for searching job descriptions
  efficiently without Elasticsearch
- JSONB column type: you get MongoDB-style flexible fields when you need them,
  with the option to index inside the JSON
- Mature and battle-tested: companies like Instagram, GitHub, and Shopify run
  their entire databases on PostgreSQL
- Free and open source

We connect to PostgreSQL from Python using SQLAlchemy. In production, we run
PostgreSQL 16 on a managed service (Supabase, Railway, or AWS RDS) so we do not
have to manage backups and uptime ourselves.

---

## 2. Complete Schema

### Table: `users`

This table stores one row per registered user. Think of it as the master list of
everyone who has an account in ClawdBot.

```sql
CREATE TABLE users (
    id                    SERIAL PRIMARY KEY,
    email                 VARCHAR(255) NOT NULL UNIQUE,
    hashed_password       VARCHAR(255) NOT NULL,
    full_name             VARCHAR(255),
    is_active             BOOLEAN NOT NULL DEFAULT TRUE,
    is_verified           BOOLEAN NOT NULL DEFAULT FALSE,
    email_notifications   BOOLEAN NOT NULL DEFAULT TRUE,
    timezone              VARCHAR(50) DEFAULT 'UTC',
    job_search_keywords   TEXT[],          -- array of search terms e.g. {"Python developer","backend engineer"}
    preferred_locations   TEXT[],          -- e.g. {"New York","Remote"}
    min_salary            INTEGER,         -- minimum salary filter in USD
    created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_login_at         TIMESTAMPTZ
);

CREATE INDEX idx_users_email ON users (email);
```

**Column explanations:**
- `id SERIAL` — auto-incrementing integer. Every user gets a unique number.
- `email UNIQUE` — no two accounts can share an email address.
- `hashed_password` — never the real password. This is the bcrypt hash.
- `TEXT[]` — PostgreSQL array type. Stores multiple strings in one column.
- `TIMESTAMPTZ` — timestamp with timezone. Always store times in UTC.

**Example row:**
```
id: 1
email: "alice@example.com"
hashed_password: "$2b$12$LQv3..."
full_name: "Alice Chen"
is_active: true
is_verified: true
email_notifications: true
timezone: "America/New_York"
job_search_keywords: {"Python developer", "backend engineer", "FastAPI"}
preferred_locations: {"New York", "Remote"}
min_salary: 100000
created_at: "2025-01-15 09:30:00+00"
```

---

### Table: `resumes`

Each user can upload multiple versions of their resume. This table tracks the
metadata; the actual file is stored in cloud storage (S3 or Supabase Storage).

```sql
CREATE TABLE resumes (
    id              SERIAL PRIMARY KEY,
    user_id         INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name            VARCHAR(255) NOT NULL,          -- friendly name the user gives it
    file_key        VARCHAR(500) NOT NULL,          -- path/key in S3/cloud storage
    file_size_bytes INTEGER,
    mime_type       VARCHAR(50),                    -- "application/pdf" or "application/docx"
    extracted_text  TEXT,                           -- full text extracted from the PDF/DOCX
    is_active       BOOLEAN NOT NULL DEFAULT FALSE, -- only one resume is "active" at a time
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_resumes_user_id ON resumes (user_id);
CREATE INDEX idx_resumes_active ON resumes (user_id, is_active) WHERE is_active = TRUE;
```

**Column explanations:**
- `REFERENCES users(id) ON DELETE CASCADE` — if a user is deleted, all their
  resumes are automatically deleted too. No orphaned data.
- `file_key` — not a URL. It is the storage key like `resumes/user_1/resume_v3.pdf`.
  The actual URL is generated on-demand and expires after 1 hour (security).
- `extracted_text` — the full text content parsed from the PDF. We store it here
  so we do not need to re-parse the file every time we need to pass it to Claude.
- `is_active` — the partial index `WHERE is_active = TRUE` makes looking up the
  active resume very fast without scanning rows where `is_active = FALSE`.

**Example row:**
```
id: 3
user_id: 1
name: "Software Engineer Resume v2"
file_key: "resumes/1/se_resume_v2.pdf"
file_size_bytes: 145234
mime_type: "application/pdf"
extracted_text: "Alice Chen\nalice@example.com\n\nEXPERIENCE\nSenior Engineer at..."
is_active: true
created_at: "2025-02-01 14:00:00+00"
```

---

### Table: `jobs`

Every job listing that has been scraped or manually added. This is the largest
table in the database.

```sql
CREATE TABLE jobs (
    id                  SERIAL PRIMARY KEY,
    user_id             INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title               VARCHAR(255) NOT NULL,
    company             VARCHAR(255) NOT NULL,
    location            VARCHAR(255),
    is_remote           BOOLEAN DEFAULT FALSE,
    description         TEXT,                      -- full job description
    description_summary VARCHAR(1000),             -- AI-generated 2-sentence summary
    url                 TEXT,                      -- original job posting URL
    source              VARCHAR(50),               -- "linkedin","indeed","glassdoor","manual"
    external_id         VARCHAR(255),              -- job ID on the source platform
    salary_min          INTEGER,                   -- annual salary in USD
    salary_max          INTEGER,
    salary_currency     VARCHAR(10) DEFAULT 'USD',
    employment_type     VARCHAR(50),               -- "full-time","part-time","contract","internship"
    experience_level    VARCHAR(50),               -- "entry","mid","senior","lead"
    posted_at           TIMESTAMPTZ,               -- when the job was posted on the source site
    expires_at          TIMESTAMPTZ,               -- when the listing expires (if known)
    scraped_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    is_active           BOOLEAN NOT NULL DEFAULT TRUE,  -- FALSE when the listing is taken down
    scraping_run_id     INTEGER REFERENCES scraping_runs(id) ON DELETE SET NULL,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Fast lookup of jobs for a specific user
CREATE INDEX idx_jobs_user_id ON jobs (user_id);

-- Used when deduplicating during scraping
CREATE UNIQUE INDEX idx_jobs_url_user ON jobs (user_id, url) WHERE url IS NOT NULL;

-- Full-text search index on title + description
CREATE INDEX idx_jobs_search ON jobs USING GIN (
    to_tsvector('english', coalesce(title, '') || ' ' || coalesce(description, ''))
);

-- Filtering by remote, source, employment_type
CREATE INDEX idx_jobs_filters ON jobs (user_id, is_remote, source, employment_type);
```

**Column explanations:**
- `UNIQUE INDEX on (user_id, url)` — prevents the same job from being scraped
  twice. `ON CONFLICT DO NOTHING` during bulk inserts silently skips duplicates.
- `GIN index` — GIN stands for Generalized Inverted Index. It is the right index
  type for full-text search in PostgreSQL. It pre-tokenizes the text so searching
  for "Python backend" across 50,000 rows takes milliseconds instead of minutes.
- `description_summary` — generated lazily by Claude. NULL until first requested.
- `scraping_run_id` — which scraping session found this job. `SET NULL` means if
  the scraping run record is deleted, the job remains but loses the reference.

**Example row:**
```
id: 101
user_id: 1
title: "Senior Backend Engineer"
company: "Stripe"
location: "San Francisco, CA"
is_remote: true
description: "We are looking for a Senior Backend Engineer to join..."
url: "https://stripe.com/jobs/listing/senior-backend-engineer/123456"
source: "linkedin"
external_id: "3456789"
salary_min: 180000
salary_max: 240000
salary_currency: "USD"
employment_type: "full-time"
experience_level: "senior"
posted_at: "2025-04-10 00:00:00+00"
scraped_at: "2025-04-15 06:00:00+00"
is_active: true
```

---

### Table: `job_applications`

Tracks the user's application history. One row per job the user has applied to
(or intends to apply to).

```sql
CREATE TABLE job_applications (
    id              SERIAL PRIMARY KEY,
    user_id         INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    job_id          INTEGER NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
    resume_id       INTEGER REFERENCES resumes(id) ON DELETE SET NULL,
    status          VARCHAR(50) NOT NULL DEFAULT 'saved',
                    -- saved | applied | phone_screen | interviewing | offer | rejected | withdrawn
    match_score     SMALLINT,           -- 0-100 AI match score
    score_breakdown JSONB,              -- { technical_skills: 85, experience_level: 70, ... }
    notes           TEXT,               -- user's personal notes
    applied_at      TIMESTAMPTZ,        -- when user submitted the application
    interview_at    TIMESTAMPTZ,        -- scheduled interview time
    offer_amount    INTEGER,            -- offer salary in USD, if received
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT unique_user_job UNIQUE (user_id, job_id)  -- cannot apply to the same job twice
);

-- Look up all applications for a user
CREATE INDEX idx_applications_user_id ON job_applications (user_id);

-- Look up applications by status (for the kanban board)
CREATE INDEX idx_applications_status ON job_applications (user_id, status);

-- Look up if a specific job has been applied to
CREATE INDEX idx_applications_job_id ON job_applications (job_id);
```

**Column explanations:**
- `status VARCHAR` — an enum-like string. We use a CHECK constraint in practice
  to enforce only valid values.
- `JSONB` — "Binary JSON". PostgreSQL stores and indexes this as native JSON.
  You can query inside it: `score_breakdown->>'technical_skills'`.
- `UNIQUE (user_id, job_id)` — prevents duplicate applications to the same job.

**Example row:**
```
id: 50
user_id: 1
job_id: 101
resume_id: 3
status: "interviewing"
match_score: 87
score_breakdown: {"technical_skills": 90, "experience_level": 85, "education": 80, "domain_knowledge": 88}
notes: "Great team vibe from LinkedIn research. Know Sarah who works there."
applied_at: "2025-04-12 10:00:00+00"
interview_at: "2025-04-20 14:00:00+00"
offer_amount: null
created_at: "2025-04-11 09:00:00+00"
```

---

### Table: `scraping_runs`

Every time the scraper runs (scheduled or manual), a row is created here. This
gives users a history of what was scraped and when.

```sql
CREATE TABLE scraping_runs (
    id                  SERIAL PRIMARY KEY,
    user_id             INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    status              VARCHAR(20) NOT NULL DEFAULT 'queued',
                        -- queued | running | completed | failed | cancelled
    triggered_by        VARCHAR(20) NOT NULL DEFAULT 'schedule',
                        -- schedule | manual | api
    sources             TEXT[],             -- which job boards were scraped
    keywords_used       TEXT[],             -- keywords passed to the scraper
    location_filter     VARCHAR(255),
    jobs_found          INTEGER DEFAULT 0,  -- how many new jobs were discovered
    jobs_inserted       INTEGER DEFAULT 0,  -- how many were actually inserted (deduped)
    error_message       TEXT,               -- error details if status = failed
    celery_task_id      VARCHAR(255),       -- Celery task ID for status polling
    started_at          TIMESTAMPTZ,
    completed_at        TIMESTAMPTZ,
    duration_seconds    INTEGER,            -- computed: EXTRACT(EPOCH FROM completed_at - started_at)
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_scraping_runs_user_id ON scraping_runs (user_id, created_at DESC);
CREATE INDEX idx_scraping_runs_status ON scraping_runs (status) WHERE status IN ('queued', 'running');
```

**Column explanations:**
- `celery_task_id` — Celery assigns a UUID to each task. The frontend can poll
  `GET /tasks/{celery_task_id}` to check progress without hitting the main API.
- The partial index `WHERE status IN ('queued', 'running')` is a small but
  clever optimization. Most rows will be 'completed'. This index only tracks the
  handful of active runs, making "find all currently running tasks" very fast.

**Example row:**
```
id: 12
user_id: 1
status: "completed"
triggered_by: "manual"
sources: {"linkedin", "indeed"}
keywords_used: {"Python developer", "FastAPI"}
location_filter: "Remote"
jobs_found: 47
jobs_inserted: 34
error_message: null
celery_task_id: "d9f3e2c1-4b5a-4f6e-89ab-1234567890ab"
started_at: "2025-04-15 06:00:00+00"
completed_at: "2025-04-15 06:03:22+00"
duration_seconds: 202
```

---

### Table: `email_messages`

Stores Gmail threads that were synced for the user. Each row represents one
complete thread (not individual messages within a thread).

```sql
CREATE TABLE email_messages (
    id                  SERIAL PRIMARY KEY,
    user_id             INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    application_id      INTEGER REFERENCES job_applications(id) ON DELETE SET NULL,
    gmail_thread_id     VARCHAR(255) NOT NULL,      -- Google's thread ID
    gmail_message_id    VARCHAR(255) NOT NULL,      -- ID of the latest message in thread
    subject             VARCHAR(500),
    sender_email        VARCHAR(255),
    sender_name         VARCHAR(255),
    snippet             TEXT,                       -- Gmail's auto-generated preview text
    body_text           TEXT,                       -- full plain-text body
    body_html           TEXT,                       -- full HTML body (kept for rendering)
    received_at         TIMESTAMPTZ,
    classification      VARCHAR(50),
                        -- application_confirmation | interview_invite | rejection
                        -- offer | follow_up_request | unknown | not_job_related
    classification_confidence  SMALLINT,           -- 0-100 how confident Claude was
    matched_company     VARCHAR(255),               -- company name extracted by Claude
    matched_job_title   VARCHAR(255),               -- job title extracted by Claude
    is_read             BOOLEAN DEFAULT FALSE,
    synced_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT unique_thread_per_user UNIQUE (user_id, gmail_thread_id)
);

CREATE INDEX idx_email_user_id ON email_messages (user_id, received_at DESC);
CREATE INDEX idx_email_application ON email_messages (application_id);
CREATE INDEX idx_email_classification ON email_messages (user_id, classification);
```

**Column explanations:**
- `gmail_thread_id` — Google groups emails with the same subject into threads.
  We store one row per thread (the latest message), not one row per email.
- `classification` — set by the `classify_email_thread` Celery task after Claude
  reads the email and categorizes it.
- `application_id` — if Claude recognizes this email belongs to a specific job
  application, it is linked here. This is how "Stripe replied to your application"
  gets surfaced automatically.

**Example row:**
```
id: 88
user_id: 1
application_id: 50
gmail_thread_id: "18d4c3f21e5a6b7c"
gmail_message_id: "18d4c3f21e5a6b7d"
subject: "Interview invitation - Senior Backend Engineer at Stripe"
sender_email: "recruiting@stripe.com"
sender_name: "Stripe Recruiting"
snippet: "Hi Alice, we were impressed by your application and would like to schedule..."
classification: "interview_invite"
classification_confidence: 97
matched_company: "Stripe"
matched_job_title: "Senior Backend Engineer"
is_read: false
received_at: "2025-04-16 14:23:00+00"
```

---

### Table: `notifications`

In-app notifications shown in the bell icon in the UI. Generated by Celery workers
when significant events happen.

```sql
CREATE TABLE notifications (
    id              SERIAL PRIMARY KEY,
    user_id         INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type            VARCHAR(50) NOT NULL,
                    -- scrape_complete | strong_match | email_classified
                    -- task_failed | interview_reminder | offer_received
    title           VARCHAR(255) NOT NULL,
    message         TEXT NOT NULL,
    action_url      VARCHAR(500),    -- optional deep link e.g. "/jobs/101"
    is_read         BOOLEAN NOT NULL DEFAULT FALSE,
    related_job_id          INTEGER REFERENCES jobs(id) ON DELETE SET NULL,
    related_application_id  INTEGER REFERENCES job_applications(id) ON DELETE SET NULL,
    related_email_id        INTEGER REFERENCES email_messages(id) ON DELETE SET NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_notifications_user ON notifications (user_id, is_read, created_at DESC);
```

**Column explanations:**
- `type` — used by the frontend to pick the right icon and color for the notification.
- `action_url` — when the user clicks the notification, they are taken to this
  relative URL. For a strong match notification, this would be `/jobs/101`.
- The index on `(user_id, is_read, created_at DESC)` means "get all unread
  notifications for user X in newest-first order" is a single efficient scan.

**Example rows:**
```
-- Example 1: scraping complete
id: 201
user_id: 1
type: "scrape_complete"
title: "Scrape finished"
message: "Found 34 new jobs. 8 are strong matches for your profile."
action_url: "/jobs?filter=new"
is_read: false
created_at: "2025-04-15 06:03:25+00"

-- Example 2: strong match
id: 202
user_id: 1
type: "strong_match"
title: "Strong match: Senior Backend Engineer at Stripe"
message: "87% match with your resume. Skills matched: Python, FastAPI, PostgreSQL."
action_url: "/jobs/101"
is_read: false
related_job_id: 101
created_at: "2025-04-15 06:05:00+00"
```

---

### Table: `llm_cache`

Every call to the Claude API is expensive. This table caches responses so that
identical prompts do not trigger duplicate API calls. Think of it as a lookup
table: "given this exact input, here is the output we already computed."

```sql
CREATE TABLE llm_cache (
    id              SERIAL PRIMARY KEY,
    cache_key       VARCHAR(64) NOT NULL UNIQUE,   -- SHA-256 hash of model+prompt
    model           VARCHAR(100) NOT NULL,
    prompt_hash     VARCHAR(64) NOT NULL,           -- SHA-256 of the prompt text alone
    prompt_preview  VARCHAR(500),                   -- first 500 chars for debugging
    response_text   TEXT NOT NULL,
    input_tokens    INTEGER,
    output_tokens   INTEGER,
    cost_usd        NUMERIC(10, 6),                 -- e.g. 0.001234
    was_cache_hit   BOOLEAN DEFAULT FALSE,          -- was this response itself returned from cache?
    task_type       VARCHAR(50),                    -- "scoring","tailoring","classification"
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at      TIMESTAMPTZ NOT NULL,           -- after this, consider the cache stale
    hit_count       INTEGER NOT NULL DEFAULT 0      -- how many times this was returned as a cache hit
);

CREATE INDEX idx_llm_cache_key ON llm_cache (cache_key);
CREATE INDEX idx_llm_cache_expires ON llm_cache (expires_at);
CREATE INDEX idx_llm_cache_task ON llm_cache (task_type, created_at DESC);
```

**Column explanations:**
- `cache_key` — computed as `sha256(model + "::" + prompt_text)`. If two workers
  try to score the same resume against the same job, they both compute the same
  cache key and one gets a cache hit.
- `expires_at` — scoring caches expire after 7 days (jobs may get updated).
  Classification caches last 30 days (email content does not change).
- `hit_count` — useful for understanding which queries are most repeated. Also
  helps calculate total money saved.
- A nightly cleanup job runs `DELETE FROM llm_cache WHERE expires_at < NOW()`.

**Example row:**
```
id: 5001
cache_key: "a3f8c2d1e4b5..."  (64-char sha256)
model: "claude-3-5-haiku-20241022"
task_type: "scoring"
prompt_preview: "JOB DESCRIPTION:\n---\nWe are looking for a Senior Backend Engi..."
response_text: '{"score": 87, "breakdown": {...}, "missing_keywords": [...]}'
input_tokens: 1842
output_tokens: 312
cost_usd: 0.000231
was_cache_hit: false
created_at: "2025-04-15 06:05:00+00"
expires_at: "2025-04-22 06:05:00+00"
hit_count: 3
```

---

## 3. Entity Relationship Diagram

This ASCII diagram shows how all tables connect. Each line between tables is a
relationship. The symbols on the line ends show cardinality:
- `|` means "exactly one"
- `o` means "zero"
- `<` or `>` means "many"

So `|o----o<` means "zero or one on the left, zero or many on the right."

```
                    ┌─────────────────────────────────────────────────────┐
                    │                                                     │
                    │                      USERS                          │
                    │  id (PK)                                            │
                    │  email                                              │
                    │  hashed_password                                    │
                    │  full_name                                          │
                    │  job_search_keywords[ ]                             │
                    │  preferred_locations[ ]                             │
                    └──────────────┬──────────────────────────────────────┘
                                   │ 1
               ┌───────────────────┼─────────────────────┬──────────────────────────────┐
               │ many              │ many                 │ many                         │ many
               │                  │                      │                              │
     ┌─────────▼──────────┐  ┌────▼───────────────┐  ┌──▼─────────────────┐  ┌────────▼──────────────┐
     │      RESUMES        │  │       JOBS          │  │   SCRAPING_RUNS    │  │   EMAIL_MESSAGES      │
     │                     │  │                     │  │                    │  │                       │
     │  id (PK)            │  │  id (PK)            │  │  id (PK)           │  │  id (PK)              │
     │  user_id (FK)       │  │  user_id (FK)       │  │  user_id (FK)      │  │  user_id (FK)         │
     │  name               │  │  title              │  │  status            │  │  gmail_thread_id      │
     │  file_key           │  │  company            │  │  triggered_by      │  │  classification       │
     │  extracted_text     │  │  location           │  │  sources[ ]        │  │  matched_company      │
     │  is_active          │  │  is_remote          │  │  jobs_found        │  │  application_id (FK)  │
     │                     │  │  description        │  │  celery_task_id    │  │                       │
     └─────────────────────┘  │  salary_min         │  │  started_at        │  └─────────────┬─────────┘
              │               │  salary_max         │  │  completed_at      │                │
              │               │  source             │  │                    │                │
              │               │  scraping_run_id(FK)│  └────────────────────┘                │
              │               │                     │           │                            │
              │               └──────────┬──────────┘           │ 1                          │
              │                          │                       │                            │
              │                          │ 1                     │ many                       │
              │                          │             (jobs.scraping_run_id                  │
              │                          │              references this)                      │
              │                          │                                                    │
              │                     many │                                                    │
              │              ┌───────────▼──────────────────┐                                │
              └──────────────► JOB_APPLICATIONS              ◄────────────────────────────────┘
                       many  │                               │
                             │  id (PK)                      │
                             │  user_id (FK)                 │
                             │  job_id (FK)                  │
                             │  resume_id (FK) ──────────────┘ (also links back to resumes)
                             │  status                       │
                             │  match_score                  │
                             │  score_breakdown (JSONB)      │
                             │  notes                        │
                             │  applied_at                   │
                             │  interview_at                 │
                             │  offer_amount                 │
                             └───────────────┬───────────────┘
                                             │ 1
                                             │ many
                             ┌───────────────▼───────────────┐
                             │        NOTIFICATIONS           │
                             │                               │
                             │  id (PK)                      │
                             │  user_id (FK)                 │
                             │  type                         │
                             │  title                        │
                             │  message                      │
                             │  related_job_id (FK)          │
                             │  related_application_id (FK)  │
                             │  related_email_id (FK)        │
                             │  is_read                      │
                             └───────────────────────────────┘


     ┌─────────────────────────────────────────────┐
     │              LLM_CACHE                      │
     │  (standalone — not FK-linked to any table)  │
     │                                             │
     │  id (PK)                                    │
     │  cache_key (UNIQUE)                         │
     │  model                                      │
     │  task_type                                  │
     │  response_text                              │
     │  input_tokens                               │
     │  output_tokens                              │
     │  cost_usd                                   │
     │  expires_at                                 │
     │  hit_count                                  │
     └─────────────────────────────────────────────┘
```

**Relationship summary in plain English:**
- One user has many resumes, jobs, applications, scraping runs, email messages, notifications
- One job belongs to one user (their scraped results are private)
- One job can have one application (a user cannot apply to the same job twice)
- One application links to one job and one resume
- One application can have many email messages linked to it (all replies about that job)
- One application can have many notifications (score notification, email received, etc.)
- One scraping run produces many jobs
- `llm_cache` is standalone — it is just a key-value store, not linked by foreign keys

---

## 4. Most Common Queries

### Query 1: Get all jobs for a user with pagination

Used by: `GET /jobs?page=2&limit=20`

```sql
SELECT
    j.id,
    j.title,
    j.company,
    j.location,
    j.is_remote,
    j.salary_min,
    j.salary_max,
    j.employment_type,
    j.source,
    j.posted_at,
    ja.status       AS application_status,
    ja.match_score  AS match_score
FROM jobs j
LEFT JOIN job_applications ja
    ON ja.job_id = j.id AND ja.user_id = j.user_id
WHERE j.user_id = 1
  AND j.is_active = TRUE
ORDER BY j.scraped_at DESC
LIMIT 20
OFFSET 20;   -- page 2: skip first 20 rows
```

**Why LEFT JOIN:** We want all jobs whether or not the user has applied. If they
have applied, we attach the status and score. If not, those columns come back as NULL.

**Performance:** The `idx_jobs_user_id` index makes the `WHERE j.user_id = 1` scan
fast even with 100,000 jobs in the table.

---

### Query 2: Full-text search for jobs

Used by: `GET /jobs/search?q=Python+backend+remote`

```sql
SELECT
    id,
    title,
    company,
    location,
    ts_rank(
        to_tsvector('english', coalesce(title, '') || ' ' || coalesce(description, '')),
        plainto_tsquery('english', 'Python backend remote')
    ) AS relevance_score
FROM jobs
WHERE
    user_id = 1
    AND to_tsvector('english', coalesce(title, '') || ' ' || coalesce(description, ''))
        @@ plainto_tsquery('english', 'Python backend remote')
ORDER BY relevance_score DESC
LIMIT 20;
```

**How it works:** `to_tsvector` converts the job text into a normalized searchable
form (stems words: "running" → "run"). `plainto_tsquery` converts the search string
the same way. `@@` is the match operator. `ts_rank` scores how well each result
matches. The GIN index on `jobs` makes this extremely fast.

---

### Query 3: Dashboard stats — application counts by status

Used by: `GET /applications/stats`

```sql
SELECT
    status,
    COUNT(*) AS count
FROM job_applications
WHERE user_id = 1
GROUP BY status
ORDER BY
    CASE status
        WHEN 'offer'        THEN 1
        WHEN 'interviewing' THEN 2
        WHEN 'phone_screen' THEN 3
        WHEN 'applied'      THEN 4
        WHEN 'saved'        THEN 5
        WHEN 'rejected'     THEN 6
        WHEN 'withdrawn'    THEN 7
    END;
```

**Result:**
```
status         | count
---------------|-------
offer          |     1
interviewing   |     3
applied        |    12
saved          |    28
rejected       |     5
```

---

### Query 4: Find all jobs not yet scored for a user's active resume

Used by: `batch_score_all` Celery task to know what needs scoring

```sql
SELECT j.id, j.title, j.company, j.description
FROM jobs j
INNER JOIN resumes r
    ON r.user_id = j.user_id AND r.is_active = TRUE
LEFT JOIN job_applications ja
    ON ja.job_id = j.id AND ja.user_id = j.user_id
WHERE
    j.user_id = 1
    AND j.scraped_at > NOW() - INTERVAL '30 days'
    AND j.is_active = TRUE
    AND (ja.match_score IS NULL OR ja.id IS NULL)  -- not yet scored
LIMIT 100;
```

**Logic:**
1. Find the user's active resume (via `resumes` join)
2. Find jobs from the last 30 days
3. `LEFT JOIN job_applications` — include jobs even if no application row exists
4. Filter to only jobs where `match_score` is missing

---

### Query 5: Get a user's full application detail (with job + resume info)

Used by: `GET /applications/{app_id}`

```sql
SELECT
    ja.id           AS application_id,
    ja.status,
    ja.match_score,
    ja.score_breakdown,
    ja.notes,
    ja.applied_at,
    ja.interview_at,
    ja.offer_amount,
    j.id            AS job_id,
    j.title         AS job_title,
    j.company,
    j.location,
    j.is_remote,
    j.url           AS job_url,
    j.salary_min,
    j.salary_max,
    r.id            AS resume_id,
    r.name          AS resume_name
FROM job_applications ja
INNER JOIN jobs j
    ON j.id = ja.job_id
LEFT JOIN resumes r
    ON r.id = ja.resume_id
WHERE ja.id = 50
  AND ja.user_id = 1;   -- security: ensure this belongs to the requesting user
```

---

### Query 6: Get unread notification count (for the bell badge)

Used by: frontend polling every 30 seconds

```sql
SELECT COUNT(*)
FROM notifications
WHERE user_id = 1
  AND is_read = FALSE;
```

This is extremely fast because of `idx_notifications_user` on `(user_id, is_read, created_at DESC)`.

---

### Query 7: Find email threads for a specific application

Used by: `GET /applications/{app_id}` to show related emails

```sql
SELECT
    em.id,
    em.subject,
    em.sender_email,
    em.sender_name,
    em.snippet,
    em.classification,
    em.received_at,
    em.is_read
FROM email_messages em
WHERE em.application_id = 50
ORDER BY em.received_at ASC;
```

---

### Query 8: Monthly LLM cost report

Used by: admin dashboard or internal monitoring endpoint

```sql
SELECT
    DATE_TRUNC('day', created_at) AS day,
    task_type,
    model,
    COUNT(*)                      AS api_calls,
    SUM(input_tokens)             AS total_input_tokens,
    SUM(output_tokens)            AS total_output_tokens,
    ROUND(SUM(cost_usd)::NUMERIC, 4) AS total_cost_usd,
    SUM(CASE WHEN was_cache_hit THEN 1 ELSE 0 END) AS cache_hits
FROM llm_cache
WHERE created_at >= DATE_TRUNC('month', NOW())
GROUP BY 1, 2, 3
ORDER BY 1 DESC, total_cost_usd DESC;
```

**Result:**
```
day        | task_type      | model             | api_calls | total_cost_usd | cache_hits
-----------|----------------|-------------------|-----------|-----------------|-----------
2025-04-15 | scoring        | claude-3-5-haiku  |       120 |          0.0278 |         45
2025-04-15 | classification | claude-3-haiku    |        38 |          0.0009 |         10
2025-04-14 | tailoring      | claude-3-5-sonnet |         5 |          0.0412 |          0
```

---

### Query 9: Deduplicate jobs during scraping (upsert)

Used by: `process_raw_listings` worker to insert without duplicates

```sql
INSERT INTO jobs (user_id, title, company, location, url, description, source, scraped_at)
VALUES
    (1, 'Senior Backend Engineer', 'Stripe', 'San Francisco, CA',
     'https://stripe.com/jobs/123', 'We are looking for...', 'linkedin', NOW()),
    (1, 'Backend Engineer', 'Plaid', 'Remote',
     'https://plaid.com/careers/456', 'Join our team...', 'indeed', NOW())
ON CONFLICT (user_id, url)
DO UPDATE SET
    title       = EXCLUDED.title,       -- update if job title changed
    description = EXCLUDED.description, -- update if description was updated
    is_active   = TRUE,                 -- re-activate if it was marked inactive
    scraped_at  = EXCLUDED.scraped_at;  -- update last seen timestamp
```

**Why this is elegant:** `ON CONFLICT DO UPDATE` is PostgreSQL's upsert — insert
if new, update if the URL already exists. This replaces what would otherwise be
a SELECT + conditional INSERT/UPDATE in application code.

---

### Query 10: Get strong matches not yet notified

Used by: `batch_score_all` callback to create targeted notifications

```sql
SELECT
    ja.id           AS application_id,
    ja.match_score,
    j.id            AS job_id,
    j.title,
    j.company,
    j.location
FROM job_applications ja
INNER JOIN jobs j ON j.id = ja.job_id
WHERE
    ja.user_id = 1
    AND ja.match_score >= 80
    AND ja.status = 'saved'      -- has not applied yet, just discovered
    AND NOT EXISTS (
        SELECT 1
        FROM notifications n
        WHERE n.related_job_id = j.id
          AND n.user_id = 1
          AND n.type = 'strong_match'
    )
ORDER BY ja.match_score DESC;
```

**Logic:** Find all jobs scored above 80 where we have not already sent a
"strong match" notification. The `NOT EXISTS` subquery prevents duplicate
notifications if the scoring task runs multiple times.

---

## 5. Alembic Migration Strategy

Alembic is the version control system for your database schema. Just as Git tracks
changes to your code files, Alembic tracks changes to your database tables. Each
change is stored as a numbered Python file called a "migration" or "revision."

### How Alembic Works

The `alembic_version` table (auto-created by Alembic) holds one row: the ID of
the currently applied migration. When you run `alembic upgrade head`, Alembic:
1. Reads the current version from `alembic_version`
2. Finds all migration files newer than that version
3. Runs them in order
4. Updates `alembic_version`

### Step-by-Step Setup

**Step 1: Install and initialize**
```bash
pip install alembic
alembic init migrations
```
This creates the `migrations/` folder and `alembic.ini` config file.

**Step 2: Configure the database connection**
```python
# migrations/env.py — tell Alembic where your database is

from app.core.config import settings
from app.models import Base   # import all your SQLAlchemy models

config.set_main_option("sqlalchemy.url", settings.DATABASE_URL)
target_metadata = Base.metadata   # Alembic reads your model definitions
```

**Step 3: Create your first migration**
```bash
alembic revision --autogenerate -m "create_users_table"
```
Alembic compares your SQLAlchemy models to the current database state and
auto-generates the SQL changes needed. It creates a file like:
`migrations/versions/0001_create_users_table.py`

**Step 4: Review the generated migration**

Always read the auto-generated file before running it. Alembic is good but not
perfect — it misses things like:
- Custom indexes (double check they were included)
- Data migrations (moving data from one column to another)
- Changes to check constraints

```python
# migrations/versions/0001_create_users_table.py

"""create users table

Revision ID: a1b2c3d4e5f6
Revises:
Create Date: 2025-01-15 10:00:00
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = 'a1b2c3d4e5f6'
down_revision = None      # this is the first migration, no previous version
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'users',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('email', sa.String(255), nullable=False),
        sa.Column('hashed_password', sa.String(255), nullable=False),
        sa.Column('full_name', sa.String(255), nullable=True),
        sa.Column('is_active', sa.Boolean(), nullable=False, server_default='true'),
        sa.Column('is_verified', sa.Boolean(), nullable=False, server_default='false'),
        sa.Column('email_notifications', sa.Boolean(), nullable=False, server_default='true'),
        sa.Column('timezone', sa.String(50), server_default='UTC'),
        sa.Column('job_search_keywords', postgresql.ARRAY(sa.Text()), nullable=True),
        sa.Column('preferred_locations', postgresql.ARRAY(sa.Text()), nullable=True),
        sa.Column('min_salary', sa.Integer(), nullable=True),
        sa.Column('created_at', sa.TIMESTAMP(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('updated_at', sa.TIMESTAMP(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('last_login_at', sa.TIMESTAMP(timezone=True), nullable=True),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index('idx_users_email', 'users', ['email'], unique=True)


def downgrade():
    op.drop_index('idx_users_email')
    op.drop_table('users')
```

**Step 5: Apply the migration**
```bash
# Apply all pending migrations to the database
alembic upgrade head

# Apply only the next one migration
alembic upgrade +1

# Check current version
alembic current

# See all migration history
alembic history --verbose
```

**Step 6: Adding a column later (example)**

Three months later, you decide to add a `linkedin_url` column to `users`:

1. Change the SQLAlchemy model:
```python
# app/models/user.py
linkedin_url = Column(String(500), nullable=True)
```

2. Generate the migration:
```bash
alembic revision --autogenerate -m "add_linkedin_url_to_users"
```

3. Review the generated file — it should contain:
```python
def upgrade():
    op.add_column('users', sa.Column('linkedin_url', sa.String(500), nullable=True))

def downgrade():
    op.drop_column('users', 'linkedin_url')
```

4. Apply it:
```bash
alembic upgrade head
```

**Step 7: Data migrations (when you need to transform existing data)**

Sometimes a schema change requires moving data, not just adding columns. You
have to write this part by hand because Alembic cannot auto-generate it:

```python
# Example: splitting "full_name" into "first_name" + "last_name"

def upgrade():
    # Step 1: Add the new columns
    op.add_column('users', sa.Column('first_name', sa.String(100), nullable=True))
    op.add_column('users', sa.Column('last_name', sa.String(100), nullable=True))

    # Step 2: Copy data from old column to new columns
    op.execute("""
        UPDATE users
        SET
            first_name = split_part(full_name, ' ', 1),
            last_name  = split_part(full_name, ' ', 2)
        WHERE full_name IS NOT NULL
    """)

    # Step 3: Drop the old column
    op.drop_column('users', 'full_name')


def downgrade():
    op.add_column('users', sa.Column('full_name', sa.String(255), nullable=True))
    op.execute("""
        UPDATE users
        SET full_name = TRIM(COALESCE(first_name, '') || ' ' || COALESCE(last_name, ''))
    """)
    op.drop_column('users', 'first_name')
    op.drop_column('users', 'last_name')
```

### Migration Rules and Best Practices

**Rule 1: Never edit an existing migration file.**
Once a migration has run on any environment (dev, staging, production), treat it
as immutable history. If you need to change something, create a new migration.
Editing old migrations is like rewriting Git history — it breaks everyone else.

**Rule 2: Always write a downgrade function.**
Even if you never use it, having a downgrade gives you an escape hatch. If a
deployment goes wrong, you can roll back the schema with `alembic downgrade -1`.

**Rule 3: Keep migrations small and focused.**
One migration = one logical change. "Add users table" is one migration.
"Add users table AND add jobs table AND add index" is three migrations rolled
into one. Small migrations are easier to debug and revert.

**Rule 4: Run migrations in CI/CD before deploying code.**
The deploy sequence should be:
1. Run `alembic upgrade head` on the production database
2. Deploy the new application code

This order matters because new code may depend on new columns. If you deploy
code first, it will crash because the columns do not exist yet.

**Rule 5: Test migrations on a copy of production data.**
Before running a migration on production, test it on a recent backup of the
production database. This catches issues like: constraint violations from
existing dirty data, slow migrations on large tables, or locking behavior that
would block the live application.

**Rule 6: For large tables, use concurrent index creation.**
Adding an index with `op.create_index()` on a table with millions of rows will
lock the table for minutes. Instead, use PostgreSQL's `CONCURRENTLY` option:
```python
op.create_index('idx_jobs_search', 'jobs', [...], postgresql_concurrently=True)
```
This builds the index in the background without blocking reads or writes.
