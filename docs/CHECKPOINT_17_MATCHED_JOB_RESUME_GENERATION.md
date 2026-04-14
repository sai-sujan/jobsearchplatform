# Checkpoint 17: Matched Job Resume Generation

## What changed
- Added a matched-job-based resume generation route at `/api/jobs/{id}/resume`
- Resume generation now uses the matched-job workspace state:
  - edited location
  - edited tech stack
  - edited bullet points
- Added `workspace_resume_path` to `matched_jobs`
- Updated the job serializer so generated resume links prefer the matched-job workspace path over the legacy job-row path
- Updated the job detail sidebar so it no longer depends on `_rowIndex` to generate a resume PDF

## Why this matters
Before this checkpoint, the main job-detail workspace still depended on the legacy `/api/generate-resume` route, which required a row index from the old Excel-based path. That made the user-facing resume flow feel partially migrated and tied a core action to legacy storage assumptions.

With this checkpoint:
- resume generation is reachable from the matched-job API surface
- the user-facing workspace can generate a PDF without legacy row-index plumbing
- generated resume output is attached to the matched-job workspace itself

## Verification
- backend compile checks passed for:
  - `api/jobs.py`
  - `src/models.py`
  - `src/database.py`
  - `src/resume/workspace_service.py`
- frontend `npm run lint` passed
- frontend `npm run build` passed
- manual smoke verification confirmed:
  - a matched job can generate a resume through `/api/jobs/{id}/resume`
  - the response returns a PDF URL and stored path
  - subsequent job payloads expose that matched-job resume path through the normal serializer

## Follow-up
- continue migrating remaining legacy tailoring/versioning flows behind matched-job-based document APIs
- eventually retire the old `/api/generate-resume` path from the primary user flow
