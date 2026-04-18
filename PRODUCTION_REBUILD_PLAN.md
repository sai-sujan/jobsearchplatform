# Production Rebuild Plan

This plan assumes the target is a hosted multi-user product for any job seeker, not a single-user local automation tool.

If we only wanted a personal desktop tool, the plan would be much smaller. For a real product, the current architecture needs a deliberate rebuild, not just incremental polish.

## What Is Wrong Today

### 1. Security and privacy blockers

| Area | Current issue | Evidence | Why it blocks production |
| --- | --- | --- | --- |
| Secrets exposure | The API returns the raw `.env` file to the frontend. | [api/server.py](api/server.py:683) | This can expose API keys, browser paths, and internal configuration to any client that can hit the endpoint. |
| Secrets mutation | The API can overwrite `.env` through a public config endpoint. | [api/server.py](api/server.py:732) | Runtime secrets should never be editable by an unauthenticated browser form. |
| Shared local resume/config access | The UI is still designed around editing one shared local resume and one shared config set. | [dashboard/src/pages/Settings.jsx](dashboard/src/pages/Settings.jsx:13) | This is operator tooling, not end-user account management. |
| No auth or authz | There is no login, tenant isolation, or permission model. | [api/server.py](api/server.py:20) | A public app without auth is not production ready. |

### 2. Data model and tenancy blockers

| Area | Current issue | Evidence | Why it blocks production |
| --- | --- | --- | --- |
| Single shared source of truth | The system of record is one Excel file plus sidecar JSON files. | [find_jobs.py](find_jobs.py:3), [api/server.py](api/server.py:31) | This cannot safely support many users, concurrent edits, or auditability. |
| Row-index identity | Many mutations still depend on `_rowIndex`. | [api/server.py](api/server.py:97), [dashboard/src/components/JobSidebar.jsx](dashboard/src/components/JobSidebar.jsx:259) | Row positions are fragile and shift when rows are deleted or deduplicated. |
| Shared file writes | Job status, notes, analysis, resume paths, and config all write to shared local files. | [api/server.py](api/server.py:369), [api/server.py](api/server.py:394), [api/server.py](api/server.py:411), [api/server.py](api/server.py:732) | This breaks isolation, makes rollback hard, and creates race conditions. |

### 3. Product generalization blockers

| Area | Current issue | Evidence | Why it blocks production |
| --- | --- | --- | --- |
| AI/ML-only prompt design | The evaluation prompt is explicitly for AI Engineer / ML Engineer / Data Scientist roles. | [src/evaluation/prompts.py](src/evaluation/prompts.py:8) | The product cannot honestly claim to support any job seeker yet. |
| Hardcoded candidate identity | Tailoring prompt is written for Sujan Dora, AI/ML Engineer, Springfield, MO. | [src/evaluation/tailor_service.py](src/evaluation/tailor_service.py:35) | This leaks one person's profile into product behavior. |
| Hardcoded resume file naming | Generated resumes still use `SujanDora_resume_*`. | [src/resume/single_generator.py](src/resume/single_generator.py:217), [api/server.py](api/server.py:544) | This is not reusable for other users. |
| Personal resume template | The LaTeX template contains personal contact info and summary text. | [templates/overleaf.txt](templates/overleaf.txt:162) | Templates must be data-driven, not hardcoded to one person. |
| Candidate assumptions in evaluator | Resume evaluator is explicitly tailored for early-career AI/ML candidates. | [src/evaluation/resume_evaluator.py](src/evaluation/resume_evaluator.py:59) | The scoring layer needs to support role families, not one niche. |

### 4. Ingestion and scraping blockers

| Area | Current issue | Evidence | Why it blocks production |
| --- | --- | --- | --- |
| Local browser dependency | Scraping uses a local persistent Chrome session stored inside the repo. | [src/scraper/job_scraper.py](src/scraper/job_scraper.py:93) | This does not scale to a hosted environment. |
| Manual login requirement | Scraper pauses for manual LinkedIn login. | [src/scraper/job_scraper.py](src/scraper/job_scraper.py:157) | This is not compatible with unattended multi-user operation. |
| Visible browser | Playwright runs `headless=False`. | [src/scraper/job_scraper.py](src/scraper/job_scraper.py:99) | That is a local debugging mode, not a production runtime model. |
| Source coupling | The system is still fundamentally LinkedIn-first even though other sources are discussed. | [src/scraper/job_scraper.py](src/scraper/job_scraper.py:129) | We need an ingestion abstraction, not a monolithic LinkedIn flow. |

### 5. Backend architecture blockers

| Area | Current issue | Evidence | Why it blocks production |
| --- | --- | --- | --- |
| Monolithic API module | `api/server.py` mixes config, job reads, job writes, resume generation, backups, and AI tailoring in one file. | [api/server.py](api/server.py:1) | This makes testing, ownership, and change safety much harder. |
| Dual entry points with overlap | `main.py` and `find_jobs.py` implement overlapping workflows. | [main.py](main.py:1), [find_jobs.py](find_jobs.py:1) | Product logic needs one service model, not multiple script-first paths. |
| Long-running work in request path | Resume generation and AI tailoring are still handled directly from API flows. | [api/server.py](api/server.py:442), [api/server.py](api/server.py:343) | Production systems need background workers, retries, and run tracking. |

### 6. Quality, testing, and ops blockers

| Area | Current issue | Evidence | Why it blocks production |
| --- | --- | --- | --- |
| No actual test suite in repo | The docs mention pytest, but there is no `tests/` directory today. | repo scan, [DEVELOPMENT.md](DEVELOPMENT.md:99) | We need repeatable verification before shipping changes safely. |
| No deployment artifacts | No Dockerfile, Compose, Alembic config, CI workflows, or infra manifests are present. | repo scan | There is no deployable production shape yet. |
| Docs mismatch reality | The README calls the project "Production Ready" while the runtime is still local-machine based. | [README_PRODUCTION.md](README_PRODUCTION.md:1) | The plan must reset expectations before rollout work begins. |

## The Right Target Architecture

Do not use Excel as the primary store.

Do not use SQLite as the production primary store either.

For a real product, use:

- Frontend: React + Vite
- API: FastAPI with routers, services, schemas, and dependency-injected auth/session handling
- Database: PostgreSQL in production, SQLite only for local development if needed
- ORM and migrations: SQLAlchemy 2.x + Alembic
- Background jobs: Redis + Celery
- File storage: S3-compatible object storage for resumes, generated PDFs, and imports
- Auth: JWT access/refresh tokens with hashed passwords and role-based access
- Observability: structured logs, request IDs, error tracking, health endpoints, worker metrics
- Deployment: Docker images, environment-based config, CI/CD, staged releases

## Product Strategy Decision

Before implementation, lock this product assumption:

- The product will support any job seeker.
- The hosted app will own accounts, resumes, preferences, job records, applications, and generated assets.
- Source ingestion will be provider-based.
- We should not make centralized LinkedIn scraping the core production dependency.

For authenticated job sites, the safer long-term model is:

- v1: manual job import, pasted URLs, CSV import, public-source scraping, and curated provider integrations
- v2: optional user-side browser connector or extension for authenticated scraping

That keeps the core product valuable even if a source changes or blocks automation.

## Phased Plan

### Phase 0. Reality reset and stop-ship fixes

Goal: remove the most dangerous assumptions before public exposure.

Deliverables:

- Remove raw `.env` read/write from browser-accessible endpoints.
- Replace config editing with server-side admin-only settings or environment-driven config.
- Remove hardcoded personal names, email, resume filenames, and profile text from templates and generators.
- Rewrite README and docs so they accurately describe the current state.
- Add a feature flag system for unfinished capabilities.

Acceptance criteria:

- No API endpoint returns raw secrets.
- No generated artifact contains hardcoded user identity.
- Docs no longer claim production readiness before the rebuild is done.

### Phase 1. Data foundation and migration

Goal: move from shared files to a real multi-tenant data model.

Decision:

- PostgreSQL is the production store.
- SQLite may be used only for local dev or tests.

Core entities:

- `User`
- `UserProfile`
- `Resume`
- `ResumeVersion`
- `SearchConfig`
- `JobSource`
- `JobSourceConnection`
- `Job`
- `JobContent`
- `JobAnalysis`
- `Application`
- `ScrapeRun`
- `GeneratedResume`
- `AuditLog`

Deliverables:

- Add SQLAlchemy models and Alembic migrations.
- Introduce repository and service layers.
- Migrate Excel rows and JSON sidecars into normalized tables.
- Preserve `job_id` as a durable identifier in the database.
- Keep a read-only import command for historical backup migration.

Acceptance criteria:

- Jobs can be listed, updated, and deleted without touching Excel.
- Every row from the current dataset can be traced to a migrated database record.
- Excel becomes import/export only, not the live system of record.

### Phase 2. Authentication and tenant isolation

Goal: make the app safe for real user accounts.

Deliverables:

- Signup, login, logout, refresh-token flow
- Password hashing and account recovery flow
- User and admin roles
- Tenant-scoped queries across every API endpoint
- Resume and generated asset ownership by user

Acceptance criteria:

- One user cannot read or mutate another user's jobs, config, resume, or runs.
- All mutating endpoints require auth.
- Admin-only settings are separated from user settings.

### Phase 3. File and asset storage rebuild

Goal: replace local-path assumptions with managed storage.

Deliverables:

- Abstract file storage behind a storage service
- Store uploaded resumes, generated PDFs, and imports in object storage
- Persist metadata and ownership in the database
- Add signed-download or authenticated download routes

Acceptance criteria:

- No production path depends on writing PDFs or resumes to local repo folders.
- Files can be served safely per user.

### Phase 4. Generalize the intelligence layer

Goal: support any job seeker, not only AI/ML profiles.

Deliverables:

- Replace AI/ML-only prompts with role-family-aware prompt templates
- Move from one hardcoded candidate profile to data-driven profile ingestion
- Add user-managed skill inventory, work history, and target-role preferences
- Split role scoring into generic signals plus role-specific adapters

Acceptance criteria:

- A software engineer, data analyst, marketer, and operations candidate can all use the core flow without inheriting AI/ML assumptions.
- Resume tailoring references the current user's data, not hardcoded profile text.

### Phase 5. Ingestion and background execution

Goal: turn script-based local runs into tracked product workflows.

Deliverables:

- Replace direct script execution with queued jobs
- Add `ScrapeRun` and `AnalysisRun` lifecycle tracking
- Add retry policies, failure reasons, and progress polling
- Create provider adapters for each source
- Support manual import and pasted job URLs from day one

Acceptance criteria:

- Long-running tasks do not block API requests.
- Users can see run status, failures, and completion history.
- The system still provides value even if one source is disabled.

### Phase 6. Backend modularization and security hardening

Goal: make the backend maintainable and safe to evolve.

Deliverables:

- Split `api/server.py` into routers:
  - `auth`
  - `jobs`
  - `applications`
  - `searches`
  - `runs`
  - `resumes`
  - `admin`
- Introduce Pydantic request/response schemas for every route
- Add centralized error handling and structured logging
- Add rate limiting and request validation

Acceptance criteria:

- No single API file owns unrelated business domains.
- Every endpoint has an explicit schema and auth boundary.

### Phase 7. Frontend productization

Goal: make the UI behave like a real product, not an operator console over local files.

Deliverables:

- Auth screens and session handling
- Onboarding flow for profile, resume, and target roles
- Settings split into user settings and admin settings
- Search run dashboard with progress and history
- Resume version management
- Application tracking with source filters, saved views, and accessible interactions

Acceptance criteria:

- A new user can sign up, onboard, upload a resume, run a search, review jobs, and track applications without touching repo files.
- The UI no longer exposes raw environment configuration.

### Phase 8. Tests, observability, and release engineering

Goal: make changes safe and releases repeatable.

Deliverables:

- Backend unit tests
- API integration tests with temporary PostgreSQL
- Frontend component tests
- Playwright end-to-end tests
- Scraper contract tests using saved HTML fixtures
- CI pipeline for lint, test, build, and migration validation
- Docker images for API, worker, frontend, and local dev stack
- Error tracking, request correlation IDs, metrics, and health checks

Acceptance criteria:

- CI blocks merges on failing tests.
- We can deploy a release candidate and verify migrations plus smoke tests automatically.

### Phase 9. Deployment and rollout

Goal: ship safely without losing existing data.

Deliverables:

- Dev, staging, and production environments
- Secret management strategy
- Data migration runbook
- Rollback plan
- Backfill scripts from Excel and legacy JSON
- Production checklist and on-call docs

Acceptance criteria:

- We can deploy from CI to staging and production.
- We can recover from a bad migration or failed release.

## Execution Order

Build in this order:

1. Phase 0
2. Phase 1
3. Phase 2
4. Phase 3
5. Phase 4
6. Phase 5
7. Phase 6
8. Phase 7
9. Phase 8
10. Phase 9

Do not start with UI-first work again.

The core risk is accidentally polishing a single-user local tool instead of building a real multi-user product.

## Definition of "Production Ready"

The project is only production ready when all of the following are true:

- No secrets are exposed through the frontend or public API.
- Every user has isolated data and assets.
- PostgreSQL is the source of truth.
- Long-running work runs in background workers.
- Resumes and templates are fully data-driven.
- The evaluation layer supports more than AI/ML candidates.
- CI, tests, and migrations are in place.
- Deployment, rollback, logging, and monitoring exist.
- Documentation matches reality.

## Recommended First Implementation Slice

The first implementation slice should not be "add more features."

It should be:

1. Remove `.env` exposure and raw local config editing from the UI and API.
2. Introduce PostgreSQL, SQLAlchemy, and Alembic.
3. Add `User`, `Resume`, `Job`, `Application`, and `ScrapeRun` models.
4. Migrate the current Excel and JSON data into the database.
5. Add auth and tenant-scoped job listing.

That slice changes the product from "shared local tool" to "real application foundation."
