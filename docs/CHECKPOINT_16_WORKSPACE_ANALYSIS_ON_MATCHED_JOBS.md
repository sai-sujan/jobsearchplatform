# Checkpoint 16: Workspace Analysis On Matched Jobs

## What changed
- Added matched-job workspace fields for:
  - edited location
  - edited ATS score
  - edited matched skills
  - edited analysis JSON
- Updated the matched-job serializer so the user-facing app prefers those workspace fields over the legacy job snapshot
- Changed `/api/jobs/{id}/analysis` so sidebar edits now save directly to `matched_jobs` instead of mutating the legacy `jobs` row
- Legacy sync and internal delivery still seed initial workspace values from the source job, but only when those matched-job workspace fields are still empty

## Why this matters
Before this checkpoint, the job-detail workspace still depended on the old `jobs` row for edited analysis data. That meant the user’s workspace was not fully owned by the delivery layer and rebuilds risked treating legacy job data as the active editable source.

With this checkpoint:
- the opened recommendation has its own durable workspace state
- analysis edits survive delivery rebuilds
- the matched-job record becomes a more complete user-facing object

## Verification
- backend compile checks passed for:
  - `api/jobs.py`
  - `src/crud.py`
  - `src/models.py`
  - `src/database.py`
- frontend `npm run lint` passed
- frontend `npm run build` passed
- manual smoke verification confirmed:
  - analysis edits save through `/api/jobs/{id}/analysis`
  - serialized job payloads return the edited workspace fields
  - a legacy delivery rebuild preserves the edited matched-job workspace version instead of resetting it from the source job

## Follow-up
- continue moving remaining resume-generation and legacy-analysis assumptions off the old job-row path
- keep narrowing the legacy `jobs` table to source-catalog responsibility only
