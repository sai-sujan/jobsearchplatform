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

## Current active slice
Transition from legacy feed scoring to real delivery scoring:
- add `matched_jobs`
- move read-time fit logic into delivery-time scoring
- preserve industry affinity as one of the stored fit components
- add experience-fit and resume-match as first-class scores

## Next implementation priorities
1. Add `matched_jobs` as the real delivery/read model
2. Build deterministic candidate scoring:
   - experience fit
   - resume match
   - role/skills fit
   - industry affinity
   - location/work mode fit
3. Move current quality filters from read-time filtering into delivery-time scoring and suppression
4. Switch user-facing feed APIs to read from `matched_jobs`
5. Surface clearer “why this matched” signals in the UI

## Scoring direction notes
- Industry affinity should be a first-class positive signal in recommendation scoring.
- If a user's resume shows strong experience in a sector such as healthcare, fintech, e-commerce, education, or developer tools, jobs in that same sector should receive a measured boost.
- This should be a boost, not a hard filter. We still want role-fit and experience-fit matches from adjacent industries to appear when they are strong enough.
- Industry affinity should be inferred from:
  - resume experience and project language
  - onboarding-selected industries
  - company/domain signals from the canonical job record
- The future `matched_jobs` scoring breakdown should explicitly store whether industry affinity contributed to the match.

## Open risks
- Current user feed still reads from the old `jobs` model rather than a dedicated delivery layer
- Internal ingestion/matching boundary is not fully isolated yet
- Recommendation filtering is now applied at read time, but not yet enforced by a true delivery engine
- Resume upload path now supports both file and text intake, but still needs stronger production hardening

## Operating rule
Every major execution slice should update:
- this tracker
- the current checkpoint note in `docs/`
- the pushed git checkpoint
