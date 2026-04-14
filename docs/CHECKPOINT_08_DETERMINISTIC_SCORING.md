# Checkpoint 08: Deterministic Composite Scoring

Date: 2026-04-14

## Goal
Improve the quality of delivered recommendations before any AI layer runs by making `matched_jobs` store a real composite fit score instead of mostly relying on the legacy skill score.

## What changed
- Added deterministic scoring components for each delivered job:
  - `experience_fit_score`
  - `resume_match_score`
  - `role_fit_score`
  - `location_fit_score`
- Combined those signals with the existing industry-affinity boost into one overall delivered fit score.
- Updated matched-job materialization so quality-filter suppression uses the delivered overall fit score, not only the legacy raw score.
- Exposed the component scores through `/api/jobs`.
- Surfaced the component breakdown in the job detail sidebar.

## Why this matters
- Users get better recommendations even when AI is disabled or unavailable.
- Feed quality improves using resume evidence and experience level, not just skill overlap.
- The web app now has a stable deterministic ranking foundation that AI can enrich later rather than replace.

## Verification target
- Backend compile passes
- Frontend lint/build pass
- `/api/jobs` returns populated component scores for delivered jobs
- Opening a job shows the deterministic fit breakdown in the sidebar
