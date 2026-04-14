# Checkpoint 13: Explicit Delivery Rebuild

Date: 2026-04-14

## Goal
Make legacy delivery rebuilds an intentional internal operation instead of something normal user traffic can trigger implicitly.

## What changed
- Added `POST /internal/v1/jobs/rebuild-delivery`
- Protected the endpoint with `X-Internal-Token`
- Rebuilds now run through the internal API surface instead of depending on hidden user-facing refresh behavior

## Why this matters
- Internal delivery and legacy rebuilds are now separated cleanly
- Operational workflows become clearer
- User-facing page loads become less coupled to older sync behavior

## Verification
- Rebuilt delivery for a test user through `/internal/v1/jobs/rebuild-delivery`
- Response returned rebuilt matched-job IDs successfully
