# Checkpoint 22: Test And Input Hardening

Date: 2026-04-15

## Summary
Stabilized the Claude-written Playwright test suite and fixed the real backend issues it exposed. The test harness now uses isolated API contexts correctly, can target whichever frontend port is running the app, and avoids committing local Playwright artifacts.

## Product Fixes
- Rejected usernames with control characters before they reach persistence.
- Added login request length validation so oversized auth payloads fail cleanly.
- Converted manual resume-intake validation errors from `500` responses into clean `422` responses.
- Fixed multipart resume upload detection so valid `.txt` uploads work and invalid/oversized files return proper `400` errors.

## Test Fixes
- Added a shared `newApiContext()` helper because Playwright's `request` fixture is already a context.
- Made `API_URL`, `FRONTEND_URL`, and Python executable configurable through environment variables.
- Updated security tests to assert the now-fixed legacy auth protections.
- Stabilized logout/CSRF tests around the real app routing and cookie behavior.
- Added a test-local `.gitignore` for Playwright reports, test results, node modules, and Python caches.

## Verification
- `python3 -m py_compile api/auth.py api/onboarding.py api/jobs.py`
- `npm run test:security` -> 16 passed
- `npm run test:auth` -> 22 passed
- `npm run test:onboarding` -> 16 passed
- `npm run test:jobs` -> 12 passed, 12 skipped because the local test users had no delivered jobs to mutate
- `npm run test:ui` -> 21 passed
- `npm run test:scoring` -> skipped because local `pytest` is not installed
