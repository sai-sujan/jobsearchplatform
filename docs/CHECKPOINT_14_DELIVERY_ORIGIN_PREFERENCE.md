# Checkpoint 14: Delivery Origin Preference

## What changed
- Added `delivery_origin` as an explicit field on `matched_jobs` so recommendation rows can be labeled by where they came from:
  - `legacy_sync`
  - `internal_delivery`
- Updated matched-job reads to prefer `internal_delivery` whenever it exists for a user.
- Prevented the user feed from silently mixing legacy-synced rows with newer internally delivered rows.
- Added a supporting index on `(user_id, delivery_origin, delivery_status)` to keep origin-aware feed reads efficient.

## Why this matters
Before this checkpoint, a user could receive jobs from the internal delivery API but still see a mixed feed that included legacy-synced rows from the old source path. That made the recommendation source ambiguous and slowed down the transition away from the legacy store.

With this checkpoint:
- internal delivery becomes the preferred user-facing recommendation source
- legacy sync remains available as a fallback and rebuild path
- the feed behaves more like a real delivery pipeline instead of a blended migration layer

## Verification
- backend compile checks passed for:
  - `api/jobs.py`
  - `src/crud.py`
  - `src/models.py`
  - `src/database.py`
- local API smoke test confirmed that a user with both legacy and internal rows only receives `internal_delivery` jobs in `/api/jobs`
- response stats now expose the selected `delivery_origin` for easier operational verification

## Follow-up
- Keep reducing the legacy `jobs` table's role in recommendation delivery
- Move more operational sync logic behind internal endpoints instead of normal user reads
- Continue toward a canonical internal delivery pipeline as the primary source of truth
