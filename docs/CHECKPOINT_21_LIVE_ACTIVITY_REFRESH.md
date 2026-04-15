# Checkpoint 21: Live Activity Refresh

## What changed

### Frontend (`dashboard/src/components/JobSidebar.jsx`)
- Added `activityTick` counter state (increments after each mutating action)
- Both the events `useEffect` and the resume history `useEffect` now include `activityTick`
  in their dependency arrays, so they re-run after any local action — not just when the
  sidebar switches to a new job
- `handleSave` (analysis save) now increments `activityTick` on success
- `handleAutoTailor` now increments `activityTick` on success
- `handleGenerateResume` now increments `activityTick` on success (the optimistic
  local-state resume history append was removed; the server-authoritative fetch replaces it)
- `handleSaveNotes` now increments `activityTick` on success

### Backend (`api/jobs.py`)
- `update_job_notes` now creates a `notes_saved` application event after persisting notes
  (the serialiser already handled this event type but it was never written)

## Why this matters

After CP20 made the activity feed render correctly for all event types, it still required
the sidebar to be closed and reopened to see new events after user actions. This checkpoint
closes that gap: status changes, analysis saves, tailoring, resume generation, and notes
saves all immediately refresh the activity feed and resume history list in the same sidebar
view without any manual reload.

## Verification
- `python -c "from api.jobs import router"` — compile passed
- `npm run build` — 114 modules, 0 errors

## Follow-up
- Status changes from `onStatusChange` (parent-managed) already trigger event reload
  because they cause the `job` prop to change, which resets the `activityTick` effects
- Consider debouncing the tick if note-saving becomes high-frequency in future
