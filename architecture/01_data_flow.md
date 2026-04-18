# ClawdBot — Data Flow

> Companion to `00_system_overview.md`. This file zooms into **how data travels** through the system, the **states** each record passes through, what happens **when things go wrong**, and the **data models** themselves.

---

## 1. Reading Guide

Each major feature gets:
1. A plain-English summary.
2. An ASCII data-flow diagram (who sends what to whom, in order).
3. A state machine if the feature has one.
4. An error-handling section (what happens when step N fails).

At the end, all shared data models are defined as TypeScript interfaces.

---

## 2. Feature — Job Scraping

### 2.1 Summary

User asks for fresh jobs → backend queues a scrape → worker fetches from LinkedIn/Indeed/Dice → new rows land in Postgres → each new job triggers a scoring task.

### 2.2 Data Flow Diagram

```
 Browser          FastAPI           Redis            Celery Worker         External Site        PostgreSQL
   │                │                 │                    │                     │                   │
   │ POST /scrapes  │                 │                    │                     │                   │
   ├───────────────▶│                 │                    │                     │                   │
   │                │ check rate limit│                    │                     │                   │
   │                ├────────────────▶│                    │                     │                   │
   │                │◀────────────────┤ ok                 │                     │                   │
   │                │ INSERT scrape   │                    │                     │                   │
   │                ├───────────────────────────────────────────────────────────────────────────────▶│
   │                │ enqueue task    │                    │                     │                   │
   │                ├────────────────▶│                    │                     │                   │
   │◀───────────────┤ 202 { scrapeId }│                    │                     │                   │
   │                │                 │  pop task          │                     │                   │
   │                │                 ├───────────────────▶│                     │                   │
   │                │                 │                    │  HTTPS GET listings │                   │
   │                │                 │                    ├────────────────────▶│                   │
   │                │                 │                    │◀────────────────────┤  HTML / JSON      │
   │                │                 │                    │ parse + dedupe      │                   │
   │                │                 │                    │ SELECT existing ids ├──────────────────▶│
   │                │                 │                    │◀────────────────────┤                   │
   │                │                 │                    │ BULK INSERT new jobs├──────────────────▶│
   │                │                 │                    │ for each new job:   │                   │
   │                │                 │                    │   enqueue score_... │                   │
   │                │                 │ PUBLISH progress   │                     │                   │
   │                │                 │◀───────────────────┤                     │                   │
   │                │ SSE forward     │                    │                     │                   │
   │◀───────────────┤                 │                    │                     │                   │
   │ live progress bar                │                    │                     │                   │
```

### 2.3 Error Handling

| Failure point | What we do |
|---|---|
| Rate limit exceeded | FastAPI returns 429 with `retryAfter` seconds; React shows a toast. No task created. |
| Worker can't reach site (timeout/5xx) | Celery retries with exponential backoff (1m, 5m, 15m), max 3 tries. After that, scrape row flips to `status='failed'` with `last_error`. |
| Site returns CAPTCHA / HTML shape changed | Parser raises `ParseError` → marked non-retryable, failure surfaced to user with "source temporarily unavailable". Sentry alert fires. |
| Postgres constraint violation (dup external_id) | Caught inside `ON CONFLICT DO NOTHING`; not an error, just a skip. |
| Redis down | FastAPI enqueue fails → return 503; React shows "try again in a moment". |

---

## 3. Feature — Resume Scoring

### 3.1 Summary

For every (job, resume) pair we need, Claude returns a structured JSON score. Results are cached in `job_scores` so repeat views are instant.

### 3.2 Data Flow Diagram

```
 Trigger              Celery Worker         Redis cache         Claude API         PostgreSQL
   │                       │                     │                  │                  │
   │ score(jobId, resumeId)│                     │                  │                  │
   ├──────────────────────▶│                     │                  │                  │
   │                       │ GET cache key       │                  │                  │
   │                       │ score:{jobId}:{rid} │                  │                  │
   │                       ├────────────────────▶│                  │                  │
   │                       │◀────────────────────┤ miss              │                  │
   │                       │ SELECT job.description, resume.parsed_text              │
   │                       ├─────────────────────────────────────────────────────────▶│
   │                       │◀─────────────────────────────────────────────────────────┤
   │                       │ build prompt (cached prefix = resume + system)          │
   │                       │ POST /v1/messages                                       │
   │                       ├───────────────────────────────────▶│                    │
   │                       │◀───────────────────────────────────┤ JSON score         │
   │                       │ validate w/ Pydantic (reject if malformed)              │
   │                       │ UPSERT job_scores                                        │
   │                       ├─────────────────────────────────────────────────────────▶│
   │                       │ SET cache (ttl 24h)                  │                   │
   │                       ├────────────────────▶│                │                   │
   │                       │ PUBLISH user:{uid}:scores:{jobId}    │                   │
   │                       ├────────────────────▶│                │                   │
   │                       │                     │ SSE → Browser  │                   │
```

### 3.3 Error Handling

| Failure point | What we do |
|---|---|
| Claude 429 (rate limit) | Celery autoretry with backoff using `Retry-After` header. |
| Claude 5xx | Retry up to 3 times; then mark score `status='failed'`, keep old score visible. |
| JSON schema invalid | One re-ask ("Your previous reply wasn't valid JSON — try again"). If still bad, fail gracefully; fall back to a keyword-overlap heuristic score so the UI isn't empty. |
| Resume text missing (still parsing) | Requeue with 30s delay; give up after 5 tries. |

---

## 4. Feature — Email Monitoring

### 4.1 Summary

Every 2 minutes, per connected user, we fetch recent Gmail messages matching our filter, classify them via Claude, link them to applications, and push notifications.

### 4.2 Data Flow Diagram

```
 Celery Beat      Email Worker       Gmail API        Claude API       PostgreSQL       Redis
     │                 │                 │                 │                │              │
     │ every 2 min     │                 │                 │                │              │
     ├────────────────▶│                 │                 │                │              │
     │                 │ for each user   │                 │                │              │
     │                 │ with connected  │                 │                │              │
     │                 │ gmail:          │                 │                │              │
     │                 │ refresh token   │                 │                │              │
     │                 ├────────────────▶│                 │                │              │
     │                 │◀────────────────┤ access_token    │                │              │
     │                 │ list msgs       │                 │                │              │
     │                 ├────────────────▶│                 │                │              │
     │                 │◀────────────────┤ [ids]           │                │              │
     │                 │ for each new id:│                 │                │              │
     │                 │   get(id)       │                 │                │              │
     │                 │   classify      ├────────────────▶│                │              │
     │                 │                 │◀────────────────┤ {category,...} │              │
     │                 │ INSERT email_messages, link to application          │              │
     │                 ├───────────────────────────────────────────────────▶│              │
     │                 │ INSERT notification if important                   │              │
     │                 ├───────────────────────────────────────────────────▶│              │
     │                 │ PUBLISH user:{uid}:notifications                   │              │
     │                 ├────────────────────────────────────────────────────────────────▶ │
     │                 │                                                                  │
     │                                                            SSE ─▶ Browser toast     │
```

### 4.3 Error Handling

| Failure point | What we do |
|---|---|
| OAuth token expired/revoked | Attempt refresh; if that fails, mark `gmail_connection.status='needs_reauth'`, surface banner in UI. |
| Gmail API quota exceeded | Back off for the rest of the hour; resume next tick. |
| Classifier Claude call fails | Default category to `other`, keep email row, skip notification, retry classification later. |
| Duplicate message id | `ON CONFLICT DO NOTHING` in `email_messages.gmail_id`. |

---

## 5. Feature — Resume Tailoring

### 5.1 Summary

User clicks "Tailor" → worker asks Claude to rewrite bullets for the target JD → renders a DOCX → uploads to R2 → pushes a download URL to the browser.

### 5.2 Data Flow Diagram

```
 Browser         FastAPI          Redis          Celery Worker        Claude API         R2          Postgres
   │                │                │                  │                  │             │              │
   │ POST /tailor   │                │                  │                  │             │              │
   ├───────────────▶│                │                  │                  │             │              │
   │                │ INSERT tailor_tasks(status=queued)├──────────────────────────────────────────────▶│
   │                │ enqueue tailor_resume_task        │                  │             │              │
   │                ├───────────────▶│                  │                  │             │              │
   │◀───────────────┤ 202 { taskId } │                  │                  │             │              │
   │                │                │ pop              │                  │             │              │
   │                │                ├─────────────────▶│                  │             │              │
   │                │                │                  │ load resume + JD │             │              │
   │                │                │                  ├──────────────────────────────────────────────▶│
   │                │                │                  │◀──────────────────────────────────────────────┤
   │                │                │                  │ POST /v1/messages (cached sys+resume)         │
   │                │                │                  ├─────────────────▶│             │              │
   │                │                │                  │◀─────────────────┤ JSON bullets │              │
   │                │                │                  │ render DOCX via python-docx    │              │
   │                │                │                  │ PUT tailored.docx              │              │
   │                │                │                  ├────────────────────────────────▶              │
   │                │                │                  │ UPDATE tailor_tasks(status=done, output_key)  │
   │                │                │                  ├──────────────────────────────────────────────▶│
   │                │                │ PUBLISH user:{uid}:tailor                                        │
   │                │                │◀──────────────────┤                                              │
   │                │ SSE            │                  │                  │             │              │
   │◀───────────────┤ { taskId, url }│                  │                  │             │              │
   │ download + diff view            │                  │                  │             │              │
```

### 5.3 Error Handling

| Failure point | What we do |
|---|---|
| Claude returns hallucinated facts (e.g., new employer) | Post-validation: compare entity set of output vs base resume; if new employer/degree appears, reject + retry once with stricter prompt. |
| DOCX render fails | Mark task `failed`, surface error "Template error"; keep the raw JSON so we can debug. |
| R2 upload 5xx | Retry 3x; if still failing, store output inline in DB as fallback and flag for re-upload. |
| Task timeout (>120s) | Celery soft-kills the task, marks it failed with `timeout` reason. User can retry from UI. |

---

## 6. Job State Machine

Every `Job` row moves through a defined lifecycle. Arrows show legal transitions.

```
               ┌─────────┐
   scrape ───▶ │   NEW   │
               └────┬────┘
                    │ (auto) resume scoring enqueued
                    ▼
               ┌─────────┐
               │ SCORED  │ ◀──── re-score if resume changes
               └────┬────┘
                    │ user action: "Save / Interested"
                    ▼
               ┌─────────┐
               │ SAVED   │
               └────┬────┘
                    │ user clicks "Tailor"
                    ▼
               ┌──────────┐
               │ TAILORED │
               └────┬─────┘
                    │ user marks "Applied" (or auto-apply feature)
                    ▼
               ┌──────────┐
               │ APPLIED  │ ───────▶ links an Application record
               └────┬─────┘
                    │ email monitor detects interview invite
                    ▼
               ┌─────────────────────┐
               │ INTERVIEW_SCHEDULED │
               └──────────┬──────────┘
                          │
           ┌──────────────┼──────────────┐
           ▼              ▼              ▼
     ┌────────┐    ┌───────────┐   ┌──────────┐
     │ OFFER  │    │ REJECTED  │   │ WITHDREW │
     └────────┘    └───────────┘   └──────────┘

 Side transitions allowed at any time:
   ANY ──▶ ARCHIVED  (user hides it)
   ANY ──▶ FLAGGED   (user reports bad data)
```

**State rules:**
- Transitions are enforced in the service layer (`app/services/jobs.py`), never raw SQL UPDATE.
- `APPLIED` always creates an `Application` row (1:1 with job).
- `REJECTED` / `OFFER` / `WITHDREW` are terminal — we stop listening to email monitor for that app.
- `ARCHIVED` is soft (row kept; filtered out of default queries).

---

## 7. Error Handling — Cross-Cutting Patterns

We use the same 4-tier strategy everywhere:

| Tier | Tool | Example |
|---|---|---|
| **Validate early** | Pydantic at API boundary | Reject `POST /tailor` without valid `jobId` before touching DB. |
| **Retry transient** | Celery `autoretry_for=(HTTPError, TimeoutError)` with exponential backoff | Claude 503 → try again in 2s, 8s, 32s. |
| **Degrade gracefully** | Fallback paths in worker | Claude scoring failed → use keyword-overlap heuristic so UI isn't blank. |
| **Observe & alert** | Sentry + structured logs + Redis dashboards | Any `status='failed'` row rising above threshold pages the on-call. |

### Dead-letter pattern

After Celery's max retries, tasks land on a `failed_tasks` Redis list. A nightly job emails a digest: "12 tailor tasks failed overnight, here are the IDs."

---

## 8. Data Models (TypeScript Interfaces)

These mirror the Postgres schema 1:1 and are used by both backend (via codegen) and frontend.

```ts
// Shared primitives
type UUID = string;              // e.g. "3b2e..."
type ISODate = string;           // e.g. "2026-04-17T12:34:56Z"
type Email = string;

// -----------------------------------------------------------
// User
// -----------------------------------------------------------
export interface User {
  id: UUID;
  email: Email;
  displayName: string;
  createdAt: ISODate;
  gmailConnected: boolean;
  defaultResumeId: UUID | null;
  preferences: {
    jobSources: Array<"linkedin" | "indeed" | "dice">;
    locations: string[];                 // ["Remote", "NYC"]
    remoteOnly: boolean;
    minSalary: number | null;
    keywords: string[];
    excludeKeywords: string[];
  };
}

// -----------------------------------------------------------
// Resume
// -----------------------------------------------------------
export interface Resume {
  id: UUID;
  userId: UUID;
  title: string;                        // "SWE Backend v3"
  r2Key: string;                        // "resumes/<uid>/<rid>.pdf"
  mimeType: "application/pdf" | "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  parsedText: string | null;            // filled by parse worker
  status: "uploading" | "parsing" | "ready" | "failed";
  createdAt: ISODate;
  updatedAt: ISODate;
}

// -----------------------------------------------------------
// Job
// -----------------------------------------------------------
export type JobStatus =
  | "new"
  | "scored"
  | "saved"
  | "tailored"
  | "applied"
  | "interview_scheduled"
  | "offer"
  | "rejected"
  | "withdrew"
  | "archived"
  | "flagged";

export interface Job {
  id: UUID;
  userId: UUID;
  source: "linkedin" | "indeed" | "dice" | "manual";
  externalId: string;                   // the site's id, for dedupe
  url: string;
  title: string;
  company: string;
  location: string;
  remote: boolean;
  description: string;                  // full JD text
  postedAt: ISODate | null;
  discoveredAt: ISODate;
  salaryMin: number | null;
  salaryMax: number | null;
  tags: string[];
  status: JobStatus;
  latestScore: JobScore | null;         // denormalized for list views
}

export interface JobScore {
  jobId: UUID;
  resumeId: UUID;
  overall: number;                       // 0-100
  dimensions: {
    skills: number;
    experience: number;
    keywords: number;
    seniority: number;
  };
  strengths: string[];
  gaps: string[];
  matchedSkills: string[];
  model: string;                         // "claude-opus-4-7"
  createdAt: ISODate;
}

// -----------------------------------------------------------
// Application
// -----------------------------------------------------------
export interface Application {
  id: UUID;
  userId: UUID;
  jobId: UUID;
  resumeId: UUID;                        // the resume actually submitted
  tailorTaskId: UUID | null;             // if tailored
  appliedAt: ISODate;
  method: "direct" | "easy_apply" | "email" | "other";
  status:
    | "applied"
    | "interview_scheduled"
    | "offer"
    | "rejected"
    | "withdrew"
    | "ghosted";
  notes: string;
  lastActivityAt: ISODate;
}

// -----------------------------------------------------------
// Notification
// -----------------------------------------------------------
export interface Notification {
  id: UUID;
  userId: UUID;
  kind:
    | "interview_invite"
    | "offer"
    | "rejection"
    | "recruiter_outreach"
    | "scrape_complete"
    | "tailor_ready"
    | "system";
  title: string;
  body: string;
  link: string | null;                   // in-app deep link
  relatedJobId: UUID | null;
  relatedApplicationId: UUID | null;
  readAt: ISODate | null;
  createdAt: ISODate;
}

// -----------------------------------------------------------
// Tailor Task
// -----------------------------------------------------------
export interface TailorTask {
  id: UUID;
  userId: UUID;
  jobId: UUID;
  baseResumeId: UUID;
  status: "queued" | "running" | "done" | "failed";
  outputR2Key: string | null;            // the tailored DOCX
  outputResumeId: UUID | null;           // optional: saved as a Resume row
  diff: Array<{
    section: "summary" | "experience" | "skills";
    before: string;
    after: string;
  }> | null;
  model: string;
  tokensIn: number | null;
  tokensOut: number | null;
  cachedTokens: number | null;
  error: string | null;
  createdAt: ISODate;
  completedAt: ISODate | null;
}

// -----------------------------------------------------------
// Email Message (mirror of Gmail)
// -----------------------------------------------------------
export interface EmailMessage {
  id: UUID;
  userId: UUID;
  gmailId: string;                       // unique per Google account
  threadId: string;
  fromAddress: Email;
  fromName: string;
  toAddress: Email;
  subject: string;
  snippet: string;
  bodyText: string;
  receivedAt: ISODate;
  category:
    | "interview_invite"
    | "offer"
    | "rejection"
    | "recruiter_outreach"
    | "auto_reply"
    | "other";
  linkedApplicationId: UUID | null;
  processedAt: ISODate;
}
```

---

## 9. Data Movement — Who Talks to Whom

A quick reference table for "where does X live and who writes it?"

| Data | Written by | Read by | Stored in |
|---|---|---|---|
| User row | Auth signup endpoint | Backend + frontend | Postgres |
| Resume binary | Browser (direct upload) | Parse worker, tailor worker | R2 |
| Resume metadata | FastAPI + parse worker | All | Postgres |
| Job rows | Scrape worker | Frontend, score/tailor workers | Postgres |
| Job scores | Score worker | Frontend | Postgres + Redis cache |
| Tailor DOCX | Tailor worker | Browser (signed URL) | R2 |
| Tailor task row | FastAPI (create) + worker (update) | Frontend | Postgres |
| Email messages | Email worker | Frontend | Postgres |
| Notifications | Workers + FastAPI | Frontend | Postgres + Redis pub/sub |
| SSE events | Workers (publish) | Frontend (subscribe via FastAPI) | Redis (transient) |
| Rate-limit counters | FastAPI | FastAPI | Redis (TTL keys) |
| Claude prompt cache | Worker (implicit, via API) | Claude API | Anthropic side |

---

## 10. Frontend ↔ Backend ↔ Workers — The Big Picture

```
            ┌────────────────────────┐
            │       FRONTEND         │
            │ (React + React Query)  │
            └──────┬──────────▲──────┘
                   │          │
         REST      │          │   Server-Sent Events
     (commands +   │          │   (live updates)
      queries)     ▼          │
            ┌────────────────────────┐
            │       BACKEND          │
            │      (FastAPI)         │
            │                        │
            │  - auth / REST         │
            │  - SSE bridge ◀────────┼──── subscribes to Redis pub/sub
            │  - enqueues tasks ─────┼──── LPUSH to Redis queue
            └──┬──────────────────▲──┘
               │                  │
   SQL (SELECT/INSERT/UPDATE)     │ publishes progress/results
               ▼                  │
            ┌────────────┐        │
            │ POSTGRES   │        │
            └────────────┘        │
                                  │
            ┌────────────────────────┐
            │        REDIS           │
            │  queues + cache +      │
            │  pub/sub channels      │
            └──┬──────────────────▲──┘
               │ BRPOP             │ PUBLISH
               ▼                   │
            ┌────────────────────────┐
            │        WORKERS         │
            │  (Celery processes)    │
            │                        │
            │  - scrape              │
            │  - score               │
            │  - tailor              │
            │  - email monitor       │
            └──┬──────────┬──────────┘
               │          │
         HTTPS │          │ HTTPS
               ▼          ▼
       ┌──────────┐  ┌──────────┐
       │ Claude   │  │ Gmail    │
       └──────────┘  └──────────┘
```

**Key takeaways:**

1. **Frontend never talks to Redis, Postgres, or external APIs directly.** Its only peer is FastAPI (REST + SSE) and R2 (via presigned URLs the backend hands out).
2. **Workers never talk to the frontend directly.** They publish to Redis; FastAPI's SSE endpoint is the bridge.
3. **Postgres is the source of truth.** Redis is allowed to lose data; Postgres is not.
4. **All long-running work is async.** Any endpoint that might exceed ~1s of work enqueues a Celery task and returns 202.
5. **External APIs (Claude, Gmail) are only ever called from workers,** never from FastAPI request handlers. This isolates latency and rate limits from user-facing response times.

---

## 11. See Also

- `00_system_overview.md` — big-picture components and tech-stack rationale.
- `05_features.md` — user-facing feature catalog.
- Code: `backend/app/models/`, `backend/app/workers/`, `frontend/src/types/api.ts`.
