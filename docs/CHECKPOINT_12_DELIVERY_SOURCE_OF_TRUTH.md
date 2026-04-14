# Checkpoint 12: Delivery Source of Truth

Date: 2026-04-14

## Goal
Make the user-facing feed trust delivered recommendations first instead of rebuilding them from the legacy jobs store on every request.

## What changed
- `api/jobs` now checks whether the user already has delivered matched jobs.
- If delivered jobs already exist, the API reads them directly and skips the legacy sync step.
- Legacy sync remains available only as a fallback for users who do not yet have any delivered feed rows.
- Added `LEGACY_DELIVERY_FALLBACK_ENABLED` to make that fallback explicit and configurable.

## Why this matters
- Reduces hidden coupling between the live feed and the old legacy jobs path.
- Makes internal delivery the preferred source of truth for normal runtime behavior.
- Keeps backward compatibility for accounts that still depend on the older path.

## Verification
- Existing delivered-feed user continued to read recommendations successfully.
- Internal delivery API remained the preferred way to add new matched jobs.
