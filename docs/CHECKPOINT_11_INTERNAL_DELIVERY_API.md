# Checkpoint 11: Internal Delivery API

Date: 2026-04-14

## Goal
Create the first real internal write boundary so ingestion/matching can deliver user recommendations without depending only on the legacy refresh-from-jobs path.

## What changed
- Added `POST /internal/v1/jobs/deliver`
- Added service authentication using `X-Internal-Token`
- Added CRUD helpers to:
  - upsert a delivered job for one user
  - sync a batch of delivered jobs for one user
  - optionally archive missing deliveries in a replace-style sync
- Internal delivery writes still reuse the current `jobs` + `matched_jobs` schema, but the write path is now explicit and service-oriented

## Why this matters
- Internal ingestion can now push recommendations into the same feed the user app already reads
- We reduce the architectural gap between the current app and the target production design
- This is a safer bridge step before a larger canonical-jobs migration

## Verification
- Server started with `INTERNAL_API_TOKEN`
- Internal request to `/internal/v1/jobs/deliver` succeeded
- Delivered job appeared in the normal `/api/jobs` feed for the target user
