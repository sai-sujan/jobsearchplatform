# Checkpoint 19: Document History And Activity

## What changed
- Added a matched-job resume history route at `/api/jobs/{id}/resumes`
- Resume generation, tailoring, and analysis edits now create timeline events on the matched job
- Updated the job detail workspace to load and display versioned resume history through the matched-job API

## Why this matters
Before this checkpoint, the workspace only knew about the latest generated PDF path, and the activity model mostly captured status changes. That made the document flow feel incomplete even though versioned resume rows already existed underneath.

With this checkpoint:
- users can see stored resume versions for a recommendation directly in the workspace
- document-related actions now appear in the same matched-job activity model as other workflow actions
- the job detail surface feels more like a durable product workspace instead of a latest-file snapshot

## Verification
- backend compile checks passed for:
  - `api/jobs.py`
- frontend `npm run lint` passed
- frontend `npm run build` passed
- manual smoke verification confirmed:
  - `/api/jobs/{id}/resumes` returns versioned resume history
  - analysis save, AI tailoring, and resume generation create matched-job events
  - repeated resume generations continue to increment stored versions

## Follow-up
- continue improving the activity feed so event metadata renders more clearly in the UI
- eventually expose a cleaner document/version comparison flow if users need deeper resume history controls
