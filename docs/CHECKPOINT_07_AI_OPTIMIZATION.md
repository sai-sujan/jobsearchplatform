# Checkpoint 07: AI Optimization

Date: 2026-04-14

## Goal
Optimize AI usage so the user-facing product stays fast and inexpensive while still giving smarter match explanations and resume tailoring when needed.

## What changed
- Added low-token AI match enrichment for a single opened matched job.
- Stored cached AI fields directly on `matched_jobs`:
  - `ai_match_score`
  - `ai_match_confidence`
  - `ai_match_summary`
  - `ai_match_reasons`
  - `ai_match_cache_key`
  - `ai_match_updated_at`
- Added a dedicated AI match service at `src/ai_match_service.py` to avoid importing the legacy evaluation package.
- Added `/api/jobs/{id}/match-intelligence` so the UI can fetch AI insights only when a user opens a specific job.
- Reduced resume-tailoring prompt size and token budget in `src/evaluation/tailor_service.py`.
- Added file-backed tailor cache under `data/ai_cache/`.

## Architecture decision
- The recommendations feed stays deterministic.
- AI is not used to rank every job in list views.
- AI is used only as secondary enrichment:
  - one opened job at a time
  - cached resume tailoring

This keeps latency and token cost under control while still improving perceived intelligence in the detail view.

## Why this is better
- Lower token spend
- Lower latency for normal page loads
- Better reliability when AI providers are unavailable
- Easier fallback to deterministic fit scoring
- Safer path for scaling recommendation volume later

## Verification target
- Backend imports compile cleanly
- Frontend build/lint pass
- `/api/jobs/{id}/match-intelligence` returns:
  - cached deterministic fallback when AI is not configured
  - cached AI result when AI is configured
- Opening the same job again reuses the cached match intelligence
