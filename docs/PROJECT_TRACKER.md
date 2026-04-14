# Project Tracker

Last updated: 2026-04-14

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

## Current active slice
Move delivery logic closer to a real recommendation pipeline:
- preserve deterministic composite scoring inside `matched_jobs`
- keep AI enrichment secondary, cached, and detail-only
- keep stronger delivery-time freshness and suppression rules stable
- prepare canonical ingestion to write directly into the delivery model
- continue deprecating or removing legacy Excel-only surfaces
- improve application history and timeline UX

## Next implementation priorities
1. Prepare canonical ingestion to write directly into `matched_jobs`
2. Preserve richer deterministic “why this matched” signals across the UI
3. Keep AI token spend limited to:
   - single-job match intelligence
   - cached resume tailoring
   - future async reranking only for top candidates
4. Continue retiring legacy Excel/config endpoints from the runtime path
5. Expand application history and notes into a more complete activity feed

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
- Resume upload path now supports both file and text intake, but still needs stronger production hardening

## Operating rule
Every major execution slice should update:
- this tracker
- the current checkpoint note in `docs/`
- the pushed git checkpoint
