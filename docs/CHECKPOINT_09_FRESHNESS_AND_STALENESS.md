# Checkpoint 09: Freshness and Staleness

Date: 2026-04-14

## Goal
Keep the recommendation feed current by rewarding fresh listings and suppressing stale untouched jobs.

## What changed
- Added `freshness_score` and `freshness_label` to delivered matched jobs.
- Freshness now contributes to the overall deterministic fit score.
- Very old untouched jobs can be marked `stale` instead of remaining active in the user feed.
- Applied/interviewing jobs remain visible even if the underlying listing gets old, so user history is preserved.

## Why this matters
- Users see fresher, more actionable roles first.
- Old stale jobs stop crowding the main feed.
- We improve recommendation quality without using more AI tokens.

## Verification
- Fresh seeded job remained `active` with a high freshness score.
- 50-day-old untouched job was marked `stale` and excluded from `/api/jobs`.
