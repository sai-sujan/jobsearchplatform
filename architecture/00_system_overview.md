# ClawdBot — System Overview

> Audience: beginners, new contributors, and future-you at 2am.
> Goal: by the end of this doc, you should be able to point at any box in the architecture diagram and explain what it does and why it exists.

---

## 1. What is ClawdBot? (Plain English)

ClawdBot is a **job application automation platform**. Instead of a human opening 15 browser tabs, copy-pasting job descriptions into ChatGPT, and manually tweaking their resume for every role, ClawdBot does all of that in the background. It **scrapes** jobs from sites like LinkedIn, Indeed, and Dice, uses **Claude (an AI model)** to score how well your resume matches each job and then to rewrite ("tailor") your resume for the ones you care about, and **monitors your Gmail** so interview invites and recruiter replies surface at the top of your dashboard instead of getting buried.

Think of it as a personal job-search assistant that never sleeps: it finds openings, ranks them, tailors documents for them, tracks where you've applied, and tells you the moment a recruiter writes back.

---

## 2. Architecture Diagram (All Components)

```
                                   ┌──────────────────────────────────┐
                                   │         USER'S BROWSER           │
                                   │  (Chrome / Safari / Firefox)     │
                                   └───────────────┬──────────────────┘
                                                   │  HTTPS
                                                   │  (HTML, JSON, JWT)
                                                   ▼
                            ┌────────────────────────────────────────────┐
                            │          REACT FRONTEND (Vite)             │
                            │  - Dashboard, Jobs list, Resume editor     │
                            │  - Tailwind UI, React Query, Zustand       │
                            │  - Talks to backend only via REST + SSE    │
                            └───────────────┬────────────────────────────┘
                                            │  REST / Server-Sent Events
                                            │  Authorization: Bearer <JWT>
                                            ▼
        ┌──────────────────────────────────────────────────────────────────────┐
        │                      FASTAPI BACKEND (Python)                        │
        │  ┌─────────────┐  ┌──────────────┐  ┌─────────────┐ ┌─────────────┐  │
        │  │  Auth /JWT  │  │  Jobs API    │  │ Resume API  │ │ Notif API   │  │
        │  └─────────────┘  └──────────────┘  └─────────────┘ └─────────────┘  │
        │                      │                                               │
        │                      │  enqueue tasks                                 │
        │                      ▼                                                │
        │             ┌──────────────────┐                                      │
        │             │  Celery producer │                                      │
        │             └──────┬───────────┘                                      │
        └────────┬───────────┼───────────────────────────────┬─────────────────┘
                 │           │                               │
      reads/writes│      pushes job ids          signed upload/download URLs
                 │           │                               │
                 ▼           ▼                               ▼
        ┌────────────────┐  ┌──────────────────┐    ┌──────────────────────┐
        │  POSTGRESQL    │  │       REDIS       │    │   CLOUDFLARE R2       │
        │ (source of     │  │ (broker + cache   │    │  (resume PDFs,        │
        │  truth: users, │  │  + SSE pub/sub)   │    │   tailored DOCX,      │
        │  jobs, apps,   │  │                   │    │   job description     │
        │  resumes meta) │  │                   │    │   snapshots)          │
        └───────▲────────┘  └─────────▲─────────┘    └──────────▲───────────┘
                │                     │                         │
                │                     │ pops tasks              │
                │                     ▼                         │
                │         ┌─────────────────────────────┐       │
                │         │      CELERY WORKERS          │      │
                └─────────┤  - scrape_jobs_worker        ├──────┘
                          │  - score_resume_worker       │
                          │  - tailor_resume_worker      │
                          │  - email_monitor_worker      │
                          │  - beat scheduler (cron)     │
                          └──────┬────────────┬──────────┘
                                 │            │
                          HTTPS  │            │  HTTPS (OAuth2)
                                 ▼            ▼
                       ┌──────────────┐  ┌──────────────────┐
                       │  CLAUDE API  │  │   GMAIL API       │
                       │ (Anthropic)  │  │  (Google OAuth)   │
                       │  scoring +   │  │   list / get /    │
                       │  tailoring   │  │   watch messages  │
                       └──────────────┘  └──────────────────┘
```

**Reading the diagram:**
- Solid vertical flow = synchronous request/response (user waits).
- Anything touching **Celery Workers** = asynchronous (user gets a "task started" response immediately, real result arrives later over SSE).
- **Redis** sits in the middle of async because it's both the "mailbox" for tasks and the "loudspeaker" for pushing updates back to the browser.

---

## 3. Components Table

| Component | What it is | Why we use it | Beginner analogy |
|---|---|---|---|
| **Browser (User)** | Chrome/Safari running our React app | It's where the human actually clicks buttons | The customer standing at the restaurant counter |
| **React Frontend** | A single-page app built with Vite + React + Tailwind | Gives a fast, snappy UI without reloading pages | The menu + waiter writing down your order |
| **FastAPI Backend** | Python web server exposing REST endpoints | Central "brain" that validates requests, enforces auth, and coordinates everything | The restaurant's head chef taking tickets and directing the kitchen |
| **PostgreSQL** | A relational database | Durable, transactional storage for users, jobs, applications — anything we can't afford to lose | The restaurant's official ledger book — nothing is "real" until it's written here |
| **Redis** | An in-memory key/value store with pub-sub | Extremely fast queue for background jobs + short-lived cache + real-time push channel | The kitchen's order spike + a walkie-talkie for shouting updates |
| **Celery Workers** | Python processes that pull tasks off Redis and execute them | Long-running work (scraping, AI calls) must NOT block web requests | The line cooks doing actual cooking in the back |
| **Celery Beat** | A scheduler that fires tasks on a cron-like interval | Lets us say "scrape Indeed every 30 minutes" | The sous-chef's egg timer reminding them to check the oven |
| **Claude API** | Anthropic's LLM accessed over HTTPS | Best-in-class text reasoning for scoring + rewriting resumes | The visiting master chef you call when the dish needs expert plating |
| **Gmail API** | Google's official email API over OAuth2 | Read-only access to the user's inbox to catch recruiter replies | The restaurant's phone line — we listen, we don't hang up on anyone |
| **Cloudflare R2** | S3-compatible object storage (no egress fees) | Cheap, unlimited home for binary files (PDFs, DOCX) | The walk-in freezer — bulky stuff that doesn't belong in the ledger |
| **JWT Auth** | Signed token in every request | Stateless auth that scales; no server-side sessions | A wristband at a festival — flash it, get in |

---

## 4. Technology Stack (with WHY + Analogies)

### 4.1 Frontend — React + Vite + TypeScript + Tailwind + React Query

- **React**: a library for building UIs out of small reusable components.
  - *Why:* massive ecosystem, easy to hire for, great DevTools.
  - *Analogy:* LEGO bricks — each component is a brick; pages are built by snapping them together.
- **Vite**: build tool and dev server.
  - *Why:* starts in ~200ms vs. Webpack's ~10s; hot-reload is instant.
  - *Analogy:* an espresso machine instead of a drip coffee pot.
- **TypeScript**: JavaScript with type checking.
  - *Why:* catches bugs (`undefined is not a function`) at write-time, not 2am-on-prod-time.
  - *Analogy:* spell-check for code.
- **Tailwind CSS**: utility-first CSS framework.
  - *Why:* no more hunting through 4000 lines of `styles.css`; classes live next to markup.
  - *Analogy:* a sticker book — grab the sticker you need and slap it on.
- **React Query (TanStack Query)**: async data-fetching + caching.
  - *Why:* handles loading states, retries, re-fetching on focus — things we'd otherwise write 300 times.
  - *Analogy:* a smart assistant that remembers answers and re-asks only when needed.

### 4.2 Backend — FastAPI + Pydantic + SQLAlchemy

- **FastAPI**: Python web framework.
  - *Why:* async by default, auto-generates OpenAPI docs, fastest of the mainstream Python frameworks.
  - *Analogy:* Django's speedy younger sibling who went to the gym.
- **Pydantic**: runtime data validation using Python type hints.
  - *Why:* if someone POSTs `{"email": 42}`, we reject it cleanly before it reaches the DB.
  - *Analogy:* the bouncer checking IDs at the door.
- **SQLAlchemy**: ORM — lets us write Python instead of raw SQL.
  - *Why:* safer (parameterized queries by default), more portable, easier migrations via Alembic.
  - *Analogy:* Google Translate between Python and SQL.

### 4.3 Database — PostgreSQL 15

- *Why:* ACID transactions, rich JSON columns (great for flexible job metadata), full-text search, battle-tested.
- *Analogy:* the restaurant's locked safe — slow to open but nothing's ever truly lost.

### 4.4 Queue & Cache — Redis 7

- *Why:* sub-millisecond reads, doubles as our Celery broker AND our pub/sub channel for SSE.
- *Analogy:* a chalkboard in the kitchen — anyone can write on it, anyone can read it, and it's erased often.

### 4.5 Background Jobs — Celery

- *Why:* scraping a site might take 60 seconds; a Claude call might take 20. Web requests must return in <1s.
- *Analogy:* dropping dry-cleaning off — you don't wait at the counter, you come back later with your ticket.

### 4.6 AI — Claude (via Anthropic API)

- *Why:* Claude follows long, nuanced instructions well (our tailoring prompt is ~2000 tokens), respects formatting, and prompt caching slashes cost on repeated resume+job comparisons.
- *Analogy:* the Michelin-star consultant you call for the hard dishes — expensive per call, so we cache aggressively.

### 4.7 Email — Gmail API + OAuth2

- *Why:* official, rate-limited but reliable; OAuth means we never see the user's password.
- *Analogy:* a hotel key-card — limited access, revocable, never the master key.

### 4.8 File Storage — Cloudflare R2

- *Why:* S3-compatible API but no egress fees, ~80% cheaper than S3 for our read pattern.
- *Analogy:* a self-storage unit — pay rent, keep stuff, grab it when needed, move out cheaply.

### 4.9 Deployment — Docker Compose (dev), Fly.io / Railway (prod)

- *Why:* one `docker-compose up` spins the whole stack on a laptop; prod uses the same images.
- *Analogy:* a lunchbox — same meal at home or at school.

---

## 5. The 5 Main User Flows

### Flow 1 — User Uploads a Resume

**Goal:** store the PDF, extract its text, keep metadata in the DB.

```
Step 1.  Browser → React: user drops "resume.pdf" into the upload zone.
Step 2.  React → FastAPI: POST /api/resumes/upload-url (asks for a presigned URL)
Step 3.  FastAPI → R2: generate presigned PUT URL (valid 5 min)
Step 4.  FastAPI → React: { uploadUrl, resumeId }
Step 5.  React → R2 (direct): PUT the file bytes to uploadUrl
           ↳ bypasses our backend, saves bandwidth + timeouts
Step 6.  React → FastAPI: POST /api/resumes/{id}/finalize
Step 7.  FastAPI → PostgreSQL: INSERT into resumes (id, user_id, r2_key, status='parsing')
Step 8.  FastAPI → Redis: enqueue parse_resume_task(resumeId)
Step 9.  FastAPI → React: 202 Accepted  (UI shows spinner)
Step 10. Celery worker pops task, downloads PDF from R2, runs pdfplumber,
         extracts text, writes resumes.parsed_text, sets status='ready'.
Step 11. Worker → Redis pub/sub channel user:{userId}:resume
Step 12. FastAPI SSE stream → Browser: { event: "resume.ready", id }
Step 13. React updates UI: green checkmark, "Ready to tailor".
```

**Why presigned URL instead of uploading through FastAPI?**
Because a 5 MB PDF going through our Python server would tie up a worker for seconds and risk timeouts. Letting the browser talk to R2 directly is faster and cheaper.

---

### Flow 2 — User Triggers a Job Scrape

**Goal:** pull fresh listings from LinkedIn/Indeed/Dice and save the new ones.

```
Step 1.  Browser: user clicks "Scrape jobs for 'backend intern, remote'".
Step 2.  React → FastAPI: POST /api/scrapes { query, sources: [linkedin, indeed, dice] }
Step 3.  FastAPI validates quota (max 5 scrapes/hour/user via Redis counter).
Step 4.  FastAPI → Redis: enqueue scrape_jobs_task(userId, query, sources)
Step 5.  FastAPI → React: 202 + scrapeId. UI shows a progress bar.
Step 6.  Worker picks up task:
           a. For each source, call its scraper module (Playwright for LinkedIn,
              HTTP+BeautifulSoup for simpler sites).
           b. Deduplicate against jobs table by (source, external_id).
           c. Bulk INSERT new jobs with status='new'.
           d. For each newly inserted job, enqueue score_resume_task(jobId, resumeId).
Step 7.  Worker publishes progress to Redis: scrape:{scrapeId} → {found: 42, new: 17}.
Step 8.  FastAPI SSE forwards progress to Browser → progress bar updates live.
Step 9.  On completion, job cards appear on the dashboard (React Query refetch).
```

**Why async?**
A LinkedIn scrape with Playwright can take 30-90 seconds. We never want the user's browser staring at a spinner tied to a single HTTP connection that long.

---

### Flow 3 — AI Tailors the Resume to a Specific Job

**Goal:** produce a custom resume DOCX emphasizing skills this job cares about.

```
Step 1.  Browser: user clicks "Tailor" on a job card.
Step 2.  React → FastAPI: POST /api/tailor { jobId, baseResumeId }
Step 3.  FastAPI creates a tailor_tasks row (status='queued') and enqueues
         tailor_resume_task(taskId).
Step 4.  FastAPI → React: 202 + taskId.
Step 5.  Worker loads: base resume text + job description + user preferences.
Step 6.  Worker → Claude API:
           - system prompt: "You are a resume tailor. Keep truthfulness..."
           - user prompt: { base_resume, job_description, emphasis_hints }
           - prompt caching enabled on the (long) system + base resume blocks.
Step 7.  Claude returns structured JSON (bullets, summary, skills order).
Step 8.  Worker renders JSON → DOCX using python-docx + the user's template.
Step 9.  Worker uploads DOCX to R2, writes tailor_tasks.output_key, status='done'.
Step 10. Worker publishes user:{userId}:tailor channel.
Step 11. Browser SSE: receives { taskId, downloadUrl }.
Step 12. React shows a "Download tailored resume" button + a diff view
         (original vs tailored bullets highlighted).
```

**Why Claude + prompt caching?**
The base resume + instructions are identical across every tailor call that day. Caching them drops cost by ~80% and latency by ~30%.

---

### Flow 4 — Email Monitoring Detects an Important Email

**Goal:** notice "We'd like to schedule an interview" without the user refreshing Gmail.

```
Step 1.  (One time) User connects Gmail via OAuth → backend stores refresh token.
Step 2.  Celery Beat fires email_monitor_task every 2 minutes per connected user.
Step 3.  Worker → Gmail API: users.messages.list with query
             'newer_than:10m (interview OR offer OR next steps OR recruiter)'
Step 4.  For each message id not already in email_messages table:
           a. GET full message body.
           b. Classify via a small Claude call:
              category ∈ {interview_invite, offer, rejection, recruiter_outreach,
                           auto_reply, other}.
           c. Try to link to an existing Application by matching sender domain
              or subject keywords against the job's company.
           d. INSERT email_messages, INSERT notifications (if category is
              important).
Step 5.  Worker publishes to user:{userId}:notifications.
Step 6.  Browser SSE: toast pops up — "Interview invite from Acme Corp".
Step 7.  The linked Application row flips status → 'interview_scheduled'.
```

**Why polling instead of Gmail push?**
Gmail push (via Pub/Sub) requires a public HTTPS endpoint + verified domain. Polling every 2 min is simpler and well within Gmail's quota for a small user base. We can upgrade later.

---

### Flow 5 — User Views the Job Match Score

**Goal:** show a 0-100 score + strengths/gaps the moment the user opens a job card.

```
Step 1.  Browser: user clicks a job card → route /jobs/:id.
Step 2.  React Query: GET /api/jobs/{id}
Step 3.  FastAPI → PostgreSQL: SELECT job JOIN latest_score WHERE job_id = ?
Step 4a. If score exists (99% of the time — it was precomputed right after scrape):
           FastAPI returns { job, score: { overall: 82, strengths: [...],
                                            gaps: [...], matchedSkills: [...] } }
Step 4b. If not (rare — legacy row):
           FastAPI enqueues score_resume_task, returns job with score: null.
           React shows skeleton "Scoring..." and subscribes to SSE.
Step 5.  Worker (if needed) fetches resume text + JD, calls Claude with a
         scoring prompt that returns strict JSON:
            { overall, dimensions: { skills, experience, keywords, seniority },
              strengths, gaps, matchedSkills }
Step 6.  Worker UPSERTs into job_scores and publishes on
         user:{userId}:scores:{jobId}.
Step 7.  React receives SSE → React Query cache updated → card re-renders
         with the score ring, top 3 strengths, and top 3 gaps.
```

**Why precompute at scrape time?**
Because users spend most of their time browsing cards, not triggering single scores. Scoring during the scrape pipeline means the UI feels instant ("I clicked, the answer was already there") instead of "I clicked, now I wait 8 seconds".

---

## 6. Glossary (Quick Reference)

| Term | One-liner |
|---|---|
| **SSE** | Server-Sent Events — a one-way stream from server to browser (like a live ticker) |
| **JWT** | JSON Web Token — a signed string the browser sends on every request to prove who it is |
| **ORM** | Object-Relational Mapper — write Python objects, it writes the SQL |
| **Presigned URL** | A temporary URL that grants limited access (e.g., PUT this one file) to R2 |
| **Prompt caching** | Telling Claude "reuse this big chunk of text from last call" to save tokens |
| **Celery Beat** | The cron-like scheduler half of Celery |
| **OAuth2** | The "Login with Google" dance — we get a token, never a password |

---

## 7. Where to Go Next

- `01_data_flow.md` — how data moves between components + state machines.
- `05_features.md` — user-facing feature list.
- Source code entry points: `backend/app/main.py`, `frontend/src/App.tsx`, `backend/app/workers/__init__.py`.
