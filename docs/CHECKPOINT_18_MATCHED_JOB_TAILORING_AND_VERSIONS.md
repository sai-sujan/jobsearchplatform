# Checkpoint 18: Matched Job Tailoring And Versions

## What changed
- Added a matched-job-based tailoring route at `/api/jobs/{id}/tailor`
- Updated the job detail sidebar to use that new route instead of the legacy `/api/ai-tailor-resume` flow
- Tailoring prompts now include compact profile-aware context:
  - candidate summary
  - target roles
  - seniority
  - current workspace location
  - current workspace tech stack
- Updated the tailoring cache key so it includes that compact profile/workspace context
- Updated matched-job resume generation to create versioned `Resume` rows through the normal CRUD path

## Why this matters
Before this checkpoint, the main workspace still relied on a legacy tailoring helper route, and the new matched-job resume path was not yet recording document versions. That left the document workflow only partially migrated.

With this checkpoint:
- both AI tailoring and PDF generation are reachable from matched-job APIs
- tailoring suggestions are better aligned to the current user instead of a hardcoded generic candidate profile
- resume generation through the matched-job path now preserves version history

## Verification
- backend compile checks passed for:
  - `api/jobs.py`
  - `src/evaluation/tailor_service.py`
  - `src/crud.py`
- frontend `npm run lint` passed
- frontend `npm run build` passed
- manual smoke verification confirmed:
  - matched-job tailoring returns tailored workspace data through `/api/jobs/{id}/tailor`
  - matched-job resume generation returns a PDF URL and version number through `/api/jobs/{id}/resume`
  - repeated resume generations increment the stored resume version

## Follow-up
- continue migrating remaining legacy helper/document routes out of the main runtime path
- later expose a clean matched-job document history UI if users need to compare resume versions
