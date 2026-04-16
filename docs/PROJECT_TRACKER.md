# Project Tracker

Last updated: 2026-04-15 (Checkpoint 22)

## Product goal
Build a production-ready user web app where each user sees only the jobs that genuinely fit them, based on their resume, role profile, experience level, and recommendation filters. Scraping and raw ingestion stay outside the user experience and feed matched opportunities into the database.

## Locked product decisions
- The product is a `web app`, not a scraper dashboard.
- End users should never browse the raw scraped job pool.
- Matching is driven by:
  - role fit
  - experience fit
  - resume match
  - industry affinity from prior experience
  - location/work mode fit
  - user-controlled recommendation filters
- The user must be able to control recommendation quality:
  - preferred sources
  - minimum fit threshold
  - noisy/fake-job filters
  - exclude keywords
- Onboarding should be resume-first and mostly automatic.

## Current architecture direction
- User-facing app:
  - auth
  - onboarding
  - profile
  - matched jobs
  - tracker
  - resume/tailoring
- Internal system:
  - ingestion
  - normalization
  - scoring
  - matched-job delivery

## Completed checkpoints
### Checkpoint 01
- Cookie-session auth foundation
- CSRF protection
- `/api/v1/auth/*` foundation
- user web app shell stabilized

Reference:
- [CHECKPOINT_01_FOUNDATION.md](./CHECKPOINT_01_FOUNDATION.md)

### Checkpoint 02
- Resume-first onboarding UX
- Resume-driven profile inference
- Better first-run/empty states

Reference:
- [CHECKPOINT_02_ONBOARDING_UX.md](./CHECKPOINT_02_ONBOARDING_UX.md)

### Checkpoint 03
- Recommendation-quality controls in onboarding and profile
- Saved filters applied live to the user feed
- Internal project tracker introduced

Reference:
- [CHECKPOINT_03_RECOMMENDATION_FLEXIBILITY.md](./CHECKPOINT_03_RECOMMENDATION_FLEXIBILITY.md)

### Checkpoint 04
- Industry affinity implemented as a live recommendation signal
- Same-sector roles now receive a measured fit boost in the current feed
- Industry-fit reasons surfaced in the job payload and detail view

Reference:
- [CHECKPOINT_04_INDUSTRY_AFFINITY.md](./CHECKPOINT_04_INDUSTRY_AFFINITY.md)

### Checkpoint 05
- Removed automation/internal-pipeline language from user-facing onboarding and profile
- Simplified the new-user setup flow to only the parts end users should control

### Checkpoint 06
- Added `matched_jobs` as the first real delivery/read model
- `/api/jobs` now reads from delivered matched rows instead of directly from the legacy `jobs` table
- Matched-job sync preserves user status, notes, and interest while materializing fit data

Reference:
- [CHECKPOINT_06_MATCHED_JOBS.md](./CHECKPOINT_06_MATCHED_JOBS.md)

### Checkpoint 07
- Kept recommendation feeds deterministic and cheap while adding on-demand AI match enrichment for a single opened job
- Added cached `ai_match_*` fields to `matched_jobs` so repeat views do not spend tokens again
- Reduced resume-tailoring prompt size and added file-backed cache reuse to cut model cost and latency

Reference:
- [CHECKPOINT_07_AI_OPTIMIZATION.md](./CHECKPOINT_07_AI_OPTIMIZATION.md)

### Checkpoint 08
- Added composite deterministic scoring to `matched_jobs`
- Stored explicit component scores for:
  - experience fit
  - resume match
  - role fit
  - location fit
- Moved minimum-match suppression to use the delivered overall fit score instead of the raw legacy job score
- Surfaced the component fit breakdown in the job detail view

Reference:
- [CHECKPOINT_08_DETERMINISTIC_SCORING.md](./CHECKPOINT_08_DETERMINISTIC_SCORING.md)

### Checkpoint 09
- Added freshness scoring and stale-delivery handling
- Fresh jobs now receive a boost inside the delivered fit score
- Old untouched jobs can be marked `stale` so they stop crowding the active recommendations feed

Reference:
- [CHECKPOINT_09_FRESHNESS_AND_STALENESS.md](./CHECKPOINT_09_FRESHNESS_AND_STALENESS.md)

### Checkpoint 10
- Added application-event timeline storage for matched jobs
- Status changes now create real history instead of only overwriting the latest state
- Locked down legacy high-risk endpoints in `api/server.py`:
  - unauthenticated config access blocked
  - unauthenticated Excel mutation endpoints blocked
  - resume-download traversal blocked

Reference:
- [CHECKPOINT_10_SECURITY_AND_TIMELINE.md](./CHECKPOINT_10_SECURITY_AND_TIMELINE.md)

### Checkpoint 11
- Added an internal delivery API at `/internal/v1/jobs/deliver`
- Internal pipeline calls can now upsert delivered jobs for a user directly into the recommendation path
- Added service-token protection for internal endpoints using `X-Internal-Token`
- This provides a cleaner write boundary for ingestion/matching without changing the live user-facing feed APIs

Reference:
- [CHECKPOINT_11_INTERNAL_DELIVERY_API.md](./CHECKPOINT_11_INTERNAL_DELIVERY_API.md)

### Checkpoint 12
- Reduced runtime dependence on the legacy refresh path in `api/jobs`
- Normal `/api/jobs` reads now prefer existing delivered recommendations
- Legacy sync is now a fallback only for users who have no delivered feed yet

Reference:
- [CHECKPOINT_12_DELIVERY_SOURCE_OF_TRUTH.md](./CHECKPOINT_12_DELIVERY_SOURCE_OF_TRUTH.md)

### Checkpoint 13
- Added an explicit internal rebuild path at `/internal/v1/jobs/rebuild-delivery`
- Legacy matched-job sync can now be triggered operationally instead of being hidden behind normal user traffic
- This makes internal delivery and operational rebuilds separate, clearer actions

Reference:
- [CHECKPOINT_13_EXPLICIT_REBUILD.md](./CHECKPOINT_13_EXPLICIT_REBUILD.md)

### Checkpoint 14
- Added `delivery_origin` as an explicit matched-job signal so the system can distinguish legacy-synced recommendations from internally delivered recommendations
- User-facing `/api/jobs` now prefers `internal_delivery` rows whenever they exist for the user, instead of mixing legacy and internal recommendation sources in the same feed
- Added a supporting matched-job index for `(user_id, delivery_origin, delivery_status)` so this preference stays cheap and stable as internal delivery becomes the primary path

Reference:
- [CHECKPOINT_14_DELIVERY_ORIGIN_PREFERENCE.md](./CHECKPOINT_14_DELIVERY_ORIGIN_PREFERENCE.md)

### Checkpoint 15
- Moved user workflow state ownership closer to `matched_jobs`
- Status, notes, and special-interest changes from the user-facing app no longer write back to the legacy `jobs` record
- Legacy sync and internal delivery now only seed user state into `matched_jobs` when a row is first created or still missing that value, which reduces the chance of rebuilds overwriting live user activity

Reference:
- [CHECKPOINT_15_MATCHED_JOB_STATE_OWNERSHIP.md](./CHECKPOINT_15_MATCHED_JOB_STATE_OWNERSHIP.md)

### Checkpoint 16
- Moved editable job-detail workspace analysis onto `matched_jobs`
- Analysis edits from the sidebar now persist as matched-job workspace state instead of mutating the legacy `jobs` row
- Delivered jobs now seed workspace analysis/location/ATS/skills when first materialized, but rebuilds preserve the user's edited workspace version

Reference:
- [CHECKPOINT_16_WORKSPACE_ANALYSIS_ON_MATCHED_JOBS.md](./CHECKPOINT_16_WORKSPACE_ANALYSIS_ON_MATCHED_JOBS.md)

### Checkpoint 17
- Moved resume generation in the job detail workspace onto a matched-job-based API route
- The sidebar no longer depends on `_rowIndex` to generate a PDF
- Generated resume paths are now stored on the matched-job workspace so the user-facing object carries its own document output

Reference:
- [CHECKPOINT_17_MATCHED_JOB_RESUME_GENERATION.md](./CHECKPOINT_17_MATCHED_JOB_RESUME_GENERATION.md)

### Checkpoint 18
- Moved AI tailoring in the job detail workspace onto a matched-job-based API route
- Tailoring prompts now include compact profile-aware context instead of relying on one hardcoded candidate profile
- Matched-job resume generation now records versioned `Resume` rows so the new path preserves document history

Reference:
- [CHECKPOINT_18_MATCHED_JOB_TAILORING_AND_VERSIONS.md](./CHECKPOINT_18_MATCHED_JOB_TAILORING_AND_VERSIONS.md)

### Checkpoint 19
- Added matched-job document history API for stored resume versions
- Resume generation, tailoring, and analysis saves now create matched-job timeline events
- The job detail workspace now shows versioned resume history instead of relying only on one latest stored PDF path

Reference:
- [CHECKPOINT_19_DOCUMENT_HISTORY_AND_ACTIVITY.md](./CHECKPOINT_19_DOCUMENT_HISTORY_AND_ACTIVITY.md)

### Checkpoint 20
- Unified activity feed: all event types now render with a readable label, a detail line, and a colour-coded left accent border in the workspace
- Backend `serialize_application_event` computes `label` and `detail` server-side for every event type (`status_changed`, `analysis_updated`, `tailor_generated`, `resume_generated`)
- Frontend no longer tries to render `old_status → new_status` for non-status events
- Activity cap raised from 4 to 8 events

Reference:
- [CHECKPOINT_20_UNIFIED_ACTIVITY_FEED.md](./CHECKPOINT_20_UNIFIED_ACTIVITY_FEED.md)

### Checkpoint 21
- Activity feed and resume history now refresh live after user actions without requiring a sidebar re-open
- `activityTick` counter triggers re-fetch of events and resume history after analysis save, tailoring, resume generation, and notes save
- Backend `update_job_notes` now creates a `notes_saved` application event (serialiser already handled it)

Reference:
- [CHECKPOINT_21_LIVE_ACTIVITY_REFRESH.md](./CHECKPOINT_21_LIVE_ACTIVITY_REFRESH.md)

### Checkpoint 22
- Stabilized the Claude-written Playwright suites and fixed the product bugs they exposed
- Test helpers now create isolated API contexts correctly and allow `API_URL` / `FRONTEND_URL` overrides
- Auth validation now rejects control-character usernames and oversized login payloads cleanly
- Resume onboarding now returns clean `4xx` errors for invalid input and accepts valid multipart text resumes

Reference:
- [CHECKPOINT_22_TEST_AND_INPUT_HARDENING.md](./CHECKPOINT_22_TEST_AND_INPUT_HARDENING.md)

### Checkpoint 23
- Fixed the fresh-user empty feed problem for data science, machine learning, analytics, and AI profiles
- Fresh data-domain users with no jobs now receive a capped set of relevant user-owned recommendations from the existing launcher/admin job pool
- Bootstrap is intentionally a temporary bridge: users still see only matched/user-owned jobs, while scraping and launcher complexity stay hidden
- Bootstrap inserts are idempotent under concurrent first-page requests, so duplicate delivery races do not return `500`

Reference:
- [CHECKPOINT_23_DATA_DOMAIN_BOOTSTRAP.md](./CHECKPOINT_23_DATA_DOMAIN_BOOTSTRAP.md)

### Checkpoint 24
- Refreshed the app UI using the external reference app as inspiration only; the reference repo was inspected in `/tmp` and not added to this project
- Replaced the large topbar with a persistent left workspace sidebar
- Reworked the recommended jobs page into a compact feed with search, source, and minimum-match controls
- Tightened job cards into cleaner horizontal recommendation rows

Reference:
- [CHECKPOINT_24_REFERENCE_UI_REFRESH.md](./CHECKPOINT_24_REFERENCE_UI_REFRESH.md)

### Checkpoint 25
- Replaced prototype nav letters with inline SVG icons
- Promoted match score from a tiny pill into an SVG score ring on every job card
- Replaced native card-level status selects with compact status pill pickers
- Added deterministic company monogram colors and semantic design tokens for status/tier/surface systems
- Enabled a two-column recommended feed on wide screens for faster decision scanning

Reference:
- [CHECKPOINT_25_PREMIUM_DECISION_UI.md](./CHECKPOINT_25_PREMIUM_DECISION_UI.md)

### Checkpoint 26
- Corrected the visual direction after the CP25 cards felt too playful
- Removed colorful company tiles, circular score rings, gradient shell treatment, and two-column billboard cards
- Moved toward a restrained job-platform style: neutral employer marks, text match badges, one-column result list, and subdued blue accent
- Kept the functional improvements from CP25 where useful, including real nav icons and status pill picker behavior

Reference:
- [CHECKPOINT_26_PROFESSIONAL_JOB_PLATFORM_STYLE.md](./CHECKPOINT_26_PROFESSIONAL_JOB_PLATFORM_STYLE.md)

## Current active slice
Move delivery logic closer to a real recommendation pipeline:
- keep the UI aligned with serious job-platform conventions rather than playful AI-dashboard styling
- keep applying the premium SaaS design critique in visible vertical slices, starting with global nav and job-card decision speed
- keep user-facing UI polished enough that fresh users trust the product before automation/internal delivery is fully complete
- keep fresh data-domain users away from empty zero-state by temporarily bootstrapping from the launcher pool
- preserve deterministic composite scoring inside `matched_jobs`
- keep AI enrichment secondary, cached, and detail-only
- keep stronger delivery-time freshness and suppression rules stable
- use the new internal delivery API as the path toward canonical ingestion
- prefer internal delivery as the user-facing source of truth once it exists
- keep user workflow state owned by `matched_jobs`, not the legacy `jobs` table
- keep editable job-detail workspace state owned by `matched_jobs`, not the legacy `jobs` table
- keep resume generation reachable from matched-job workspace APIs instead of legacy row-index APIs
- keep AI tailoring reachable from matched-job workspace APIs instead of legacy helper routes
- continue deprecating or removing legacy Excel-only surfaces
- improve application history and timeline UX
- expand matched-job document history and activity visibility in the workspace

## Next implementation priorities
1. Continue the mature job-platform style pass on tracker columns and the job detail workspace
2. Replace the data-domain bootstrap bridge with canonical internal matcher delivery once the pipeline can upsert enough recommendations directly into user workspaces
3. Preserve richer deterministic “why this matched” signals across the UI
4. Keep AI token spend limited to:
   - single-job match intelligence
   - cached resume tailoring
   - future async reranking only for top candidates
5. Continue retiring legacy Excel/config endpoints from the runtime path
6. ~~Expand application history and notes into a more complete activity feed~~ ✓ done in CP20/CP21 — feed renders correctly and refreshes live after all user actions
7. Start separating canonical/internal delivery from the legacy source store more explicitly

## Scoring direction notes
- Industry affinity should be a first-class positive signal in recommendation scoring.
- If a user's resume shows strong experience in a sector such as healthcare, fintech, e-commerce, education, or developer tools, jobs in that same sector should receive a measured boost.
- This should be a boost, not a hard filter. We still want role-fit and experience-fit matches from adjacent industries to appear when they are strong enough.
- Industry affinity should be inferred from:
  - resume experience and project language
  - onboarding-selected industries
  - company/domain signals from the canonical job record
- The future `matched_jobs` scoring breakdown should explicitly store whether industry affinity contributed to the match.

## AI optimization notes
- Feed ranking should remain deterministic by default so list views stay fast, predictable, and cheap.
- AI should not run for every job in the feed.
- AI should be used only for:
  - on-demand match intelligence for one opened job
  - cached resume tailoring / PDF preparation
  - future async reranking for only the strongest candidates if needed
- Any AI enrichment must cache by compact profile + resume excerpt + job excerpt hash so repeated views reuse the same result.
- Token budgets should be explicit and conservative:
  - compact resume excerpt
  - compact job description excerpt
  - bounded skills list
  - short JSON-only output

## Open risks
- Current canonical source is still the legacy user-owned `jobs` table, even though the web app now reads `matched_jobs`
- Internal ingestion/matching boundary is not fully isolated yet
- Recommendation filtering is now enforced through matched-job materialization, but still originates from the legacy source store
- Data-domain fresh users now get a useful feed from a capped legacy bootstrap, but this must not become the long-term production matching architecture
- Some old tailoring and resume/version bookkeeping flows still exist in legacy routes even though the main workspace path is now matched-job-based
- Resume upload path now supports both file and text intake with clean validation responses, but still needs object-storage-backed production handling
- Activity feed renders all event types correctly and now refreshes live after user actions
- End-to-end tests are in place; local scoring tests skip until `pytest` is installed

## Operating rule
Every major execution slice should update:
- this tracker
- the current checkpoint note in `docs/`
- the pushed git checkpoint
