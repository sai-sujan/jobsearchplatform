# Checkpoint 10: Security Hardening and Status Timeline

Date: 2026-04-14

## Goal
Close the most dangerous legacy API holes and add proper application-status history for matched jobs.

## What changed
- Added `ApplicationEvent` records for matched jobs.
- Status changes now create timeline events instead of silently overwriting state.
- Added `GET /api/jobs/{id}/events`.
- Surfaced recent status updates in the job detail sidebar.
- Locked down high-risk legacy routes in `api/server.py`:
  - `GET /api/config`
  - `POST /api/config`
  - `GET /api/legacy/jobs`
  - `POST /api/update-status`
  - `POST /api/update-special-interest`
  - `POST /api/update-notes`
- Sandboxed `/api/download-resume/{filename}` to `RESUMES_DIR` so traversal payloads cannot escape.

## Why this matters
- We stop exposing config and Excel mutation routes to unauthenticated callers.
- We reduce the attack surface while the repo still contains legacy code.
- Users and the tracker now have a real status-change history.

## Verification
- Unauthenticated checks returned:
  - `/api/config` -> `401`
  - `/api/update-status` -> `401`
  - `/api/legacy/jobs` -> `401`
  - traversal download -> `404`
- Status patch created a real timeline event and `GET /api/jobs/{id}/events` returned it.
