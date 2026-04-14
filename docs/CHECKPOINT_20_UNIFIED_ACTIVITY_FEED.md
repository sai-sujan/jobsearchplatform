# Checkpoint 20: Unified Activity Feed

## What changed

### Backend (`api/jobs.py`)
- Added `_STATUS_LABELS` map for human-readable status names
- Added `_event_label_and_detail()` helper that computes a `(label, detail)` pair for every event type:
  - `status_changed` → "Status changed to Applied" / "Previously: Saved"
  - `analysis_updated` → "Analysis updated" / "ATS score set to 82 · 4 bullet points"
  - `tailor_generated` → "AI tailoring applied" / "ATS score 78 · 5 AI bullet points"
  - `resume_generated` → "Resume v2 generated" / "PDF saved to workspace"
  - `notes_saved` → "Notes saved" / "Research notes updated"
  - Fallback for unknown future types
- `serialize_application_event` now includes `label` and `detail` fields so the frontend renders computed strings rather than raw event_type tokens

### Frontend (`dashboard/src/components/JobSidebar.jsx`)
- Activity section renamed from "Recent updates" to "Activity"
- All event types now render with their computed `label` and `detail` lines from the API
- Previously the renderer tried to show `old_status → new_status` for all events, which produced nonsense for non-status events
- Cap increased from 4 to 8 events
- Each item gets a `timeline-event-{type}` class for type-aware styling

### CSS (`dashboard/src/components/JobSidebar.css`)
- `timeline-history-item` now has a left accent border (3px)
- Color per event type:
  - `status_changed` — blue
  - `tailor_generated` — purple
  - `resume_generated` — green
  - `analysis_updated` — amber
  - `notes_saved` — muted grey
- Added `.timeline-event-detail` (slightly stronger muted) and `.timeline-event-time` (smaller, muted) for the two sub-lines

## Why this matters

After Checkpoint 19 added document events to the timeline model, the UI was broken for non-status events — rendering them as `"saved to saved"` since they had no `old_status`/`new_status`. This checkpoint makes the activity feed a real audit view: every action type renders with a clear label, a detail line, and a color that signals what kind of action it was.

## Verification
- `python -c "from api.jobs import router"` — compile passed
- `npm run build` — 114 modules, 0 errors

## Follow-up
- Add event refresh after user actions (status change, tailor, generate) so the feed updates live without requiring a sidebar re-open
- Consider adding a "notes saved" event when notes are saved for a complete audit trail
