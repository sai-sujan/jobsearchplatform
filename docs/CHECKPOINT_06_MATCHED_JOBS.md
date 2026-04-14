# Checkpoint 06: Matched Jobs

Date: 2026-04-14

## What landed
- Added a first real `matched_jobs` table as the user-facing delivery/read model
- Added sync logic to materialize matched jobs from the current legacy `jobs` source
- Added matched-job fields for:
  - delivery status
  - user status
  - fit score
  - base skill score
  - industry boost
  - fit reasons
  - notes
  - special interest
- Switched `/api/jobs` to read from `matched_jobs`
- Switched user status, notes, special-interest, analysis, and archive actions to operate through matched-job IDs

## Why this matters
- The web app now reads from a real delivery table instead of treating the raw source table as the product feed
- This gives us a stable place to store recommendation decisions separately from source-job data
- It sets up the next scoring phase cleanly: experience fit, resume match, and richer delivery logic can now be added to `matched_jobs`

## Verified behavior
- New matched rows are created automatically when `/api/jobs` is requested
- API payloads now return:
  - matched-job ID
  - underlying job record ID
  - delivered fit data
- Direct smoke test confirmed:
  - one source job created
  - one `matched_jobs` row materialized
  - `/api/jobs` returned the matched row, not the raw job ID

## Remaining gap
- The current delivery sync still materializes from the legacy user-owned `jobs` table
- Canonical ingestion and a dedicated matching pipeline still need to replace that source path
