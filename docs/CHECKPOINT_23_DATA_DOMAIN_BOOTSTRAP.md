# Checkpoint 23: Data-Domain Feed Bootstrap

Date: 2026-04-15

## Summary
Fixed the fresh-user empty feed problem for data science, machine learning, analytics, and AI profiles. When a new user has completed onboarding but has no delivered jobs yet, the app can now seed their user-owned workspace from the existing launcher/admin job pool instead of showing an unprofessional zero-state.

This is a bridge toward the production internal matcher. Users still only see their own matched workspace state; raw scraping and launcher controls remain hidden from the web app.

## Product Fixes
- Added a data-domain profile detector based on target roles, parsed skills, and candidate summary.
- Added a data-domain job detector for existing launcher-pool jobs.
- Fresh data/ML/AI users with no jobs now receive a capped set of relevant cloned jobs from the largest legacy job pool.
- Cloned jobs belong to the requesting user, so status, notes, analysis, and resume outputs stay isolated per account.
- Bootstrap delivery treats the recommendation as newly delivered to the user while leaving final production freshness to the future internal matcher.
- Added `LEGACY_BOOTSTRAP_MAX_JOBS` with a default cap of `80`.

## Reliability Fixes
- Made bootstrap insertion idempotent for concurrent first-page requests.
- Duplicate `user_id + job_link` races now resolve through the unique database constraint without returning `500`.

## Verification
- `python3 -m py_compile src/crud.py src/settings.py`
- `npm run test:jobs` -> 24 passed
- `npm run test:security` -> 16 passed
- `npm run lint` from `dashboard/` -> passed
- `npm run build` from `dashboard/` -> passed

## Follow-Up
- Replace this bridge with canonical internal delivery from the ingestion/matching pipeline.
- Add more domain bootstraps only if they are backed by enough high-quality source data.
- Keep this logic capped and temporary so it does not become the long-term 10K-user matching architecture.
