## graphify

This project has a graphify knowledge graph at graphify-out/.

Rules:
- Before answering architecture or codebase questions, read graphify-out/GRAPH_REPORT.md for god nodes and community structure
- If graphify-out/wiki/index.md exists, navigate it instead of reading raw files
- After modifying code files in this session, run `npx graphify hook-rebuild` to keep the graph current (a PostToolUse hook runs this automatically after each Edit/Write)

---

## Project: CareerOS

> **Naming**: This project is called **CareerOS**. Never use "ClawdBot" anywhere — it was a temporary internal alias.

React + Vite dashboard in `dashboard/` backed by FastAPI on port 5001. SQLAlchemy + SQLite at `data/jobs.db`. Cookie-session + CSRF + JWT auth.

### Running the project

```bash
# Backend (from job-applications/)
uvicorn api.server:app --reload --port 5001

# Frontend (from job-applications/dashboard/)
npm run dev

# Verify backend compiles
python -c "from api.jobs import router"

# Verify frontend builds
cd dashboard && npm run build
```

The backend must be running separately — Claude cannot keep uvicorn alive between tool calls. If frontend shows network errors, remind user to check backend on port 5001.

---

## Architecture

### Data model (locked)
- `matched_jobs` table — user-facing delivery model. All `/api/jobs` reads come from here.
- `jobs` table — canonical scraped data (internal only, source of truth for ingestion)
- `ApplicationEvent` — stores all workspace history (status changes, tailoring, notes, resumes)
- `Resume` — versioned resume rows, linked to matched_job

**Never read from the `jobs` table in user-facing routes.** Use `matched_jobs`.

### Stack map
- Frontend entry: `dashboard/src/App.jsx` — routes, auth gate, onboarding gate, top-level mutation handlers (`handleStatusChange`, `handleNotesChange`, `handleTailorJob`, `handleDeleteJob`)
- Pages: `TodaysJobs.jsx`, `AllJobs.jsx` (Discover), `AppliedJobs.jsx`, `TrackerBoard.jsx`, `TailorPage.jsx`, `Settings.jsx`, `AuthPage.jsx`, `OnboardingPage.jsx`
- Helpers: `dashboard/src/lib/jobs.js` — `normalizeStatus`, `getJobId`, `getDisplayMatchScore`, `APPLIED_STATUSES`, `formatCompactDate`, `getSourceLabel`. Always import from here; never re-derive status/score logic inline.
- API client: `dashboard/src/api/client.js` — axios instance with auth interceptor. Use `api.get/post/patch/delete`, never `fetch`.
- Data shape: mixed-case keys (`Status`, `Company`, `Title`, `Skill Score`, `Date Found`, `Matched Skills`, `Job Type`, `Search Query`) plus lowercase `id`, `notes`, `applied_at`, `date_applied`.

---

## Working endpoints (do NOT re-invent)

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/jobs` | Returns `{ jobs, stats }` from `matched_jobs` |
| PATCH | `/api/jobs/{id}/status?status=...` | Update status |
| PATCH | `/api/jobs/{id}/notes?notes=...` | Update notes |
| PATCH | `/api/jobs/{id}/interest` | Toggle star/interest |
| PATCH | `/api/jobs/{id}/analysis` | Update AI analysis fields |
| DELETE | `/api/jobs/{id}` | Delete job |
| POST | `/api/jobs/{id}/tailor` | AI tailor resume |
| POST | `/api/jobs/{id}/resume` | Generate PDF resume |
| POST | `/api/v1/auth/logout` | Logout |
| GET | `/internal/v1/jobs/deliver` | Internal delivery (X-Internal-Token) |
| GET | `/internal/v1/jobs/rebuild-delivery` | Rebuild delivery feed |

---

## Mutation pattern (frontend)

Always optimistic-update local `jobs` state FIRST, then call the API, then `showToast`. On error, reload via `loadApp()` and toast an error. See `handleStatusChange` in App.jsx as the canonical pattern. Never skip the optimistic update.

---

## Status vocabulary

Backend enum: `not_applied | applied | screening | interviewing | accepted | rejected | skipped`

UI labels derived via `normalizeStatus(Status)` then mapped per page. TrackerBoard columns match this enum 1:1. Never hardcode status strings outside of `lib/jobs.js`.

---

## Design tokens

```css
--bg: #f1f5f9;       /* slate-100 */
--surface: #ffffff;
--border: #e2e8f0;   /* slate-200 */
--primary: #4f46e5;  /* indigo-600 */
--text: #0f172a;     /* slate-900 */
--muted: #64748b;    /* slate-500 */
```

No glassmorphism. No gradients on body. White cards on slate background.

---

## Rules when editing UI

- Every button must have an `onClick`. No placeholder UI. No dead elements.
- No hardcoded fallback numbers like `{interviewingCount || 3}` — show real zero-state.
- Static mock rows (e.g., "Stripe / Figma follow-ups") must be derived from real `jobs` data or replaced with an empty state.
- No smart/curly quotes (`'`, `'`, `"`, `"`) in JSX string literals — Vite throws parse errors. Use plain ASCII `'` and `"` only.
- For notes/text persistence: optimistic local state + onBlur save + dirty indicator. Pattern: see `NotesEditor` in `AllJobs.jsx`.
- Filter dropdowns: use outside-click-to-close pattern. Pattern: see `FilterDropdown` in `AllJobs.jsx`.
- Dynamic charts: compute SVG path from last-7-day buckets of `applied_at`/`date_applied`. Pattern: see `buildSplinePath` in `dashboardUtils.js`.
- Sidebar search in App.jsx navigates to `/jobs?q=...`; AllJobs reads initial search via `useSearchParams`.
- Sidebar collapse toggled by `sidebar-collapsed` CSS class on `.app-frame` (changes grid column to 56px).

---

## Rules when editing backend

- All job queries must target `matched_jobs` table, not `jobs`.
- AI enrichment is on-demand, cached, and detail-view-only — never run AI in feed-ranking paths.
- `job_link` is unique — dedup happens at insert time, never do manual dedup in Python.
- Add `Depends(get_current_user)` to all new endpoints. No unprotected routes.
- New router files go in `api/`, registered via `app.include_router()` in `api/server.py`.
- `ApplicationEvent` must be created for every user-visible workspace action (status change, notes save, tailor, resume gen).

---

## Onboarding

- Resume step uses a file upload input (PDF/DOCX/TXT), not a textarea. Backend uses PyPDF2/python-docx/docx2txt to extract text.
- Work mode, Employment type, Industries, and Preferred locations all have an "Any" chip. "Any" and specific options are mutually exclusive (toggleWithAny helper).
- Filter out "Any" from all list comprehensions in `build_generated_search_presets()` in `src/onboarding.py`.

---

## Verification steps (run before marking any checkpoint done)

```bash
# 1. Backend compiles
python -c "from api.jobs import router"

# 2. Frontend builds
cd dashboard && npm run build

# 3. Update docs
# - docs/PROJECT_TRACKER.md — add checkpoint entry, update "Last updated", adjust open risks
# - docs/CHECKPOINT_NN_NAME.md — what changed, why, verification, follow-up
```

Never mark a checkpoint done without passing both checks.

---

## Non-functional audit (open work)

1. **TrackerBoard "+" button** → Add-job modal (currently navigates to /jobs)
2. **TailorPage** → wire to route state / `jobs` prop, hit real `/api/jobs/{id}/tailor` and `/api/jobs/{id}/resume`; remove hardcoded `DEFAULT_JD`, `BASE_RESUME`, `TAILORED_RESUME`, `matchedScore = 78`, `atsScore = 92`
3. **AppliedJobs** → stat-card deep links, Export CSV, Add New modal, real pagination, dynamic date range, real Upcoming Interviews + Recent Activity

---

## Before claiming done

- Start the dev server and click through the feature in a browser.
- Test the golden path AND the zero-state / empty case.
- Avoid re-reading files you just edited — trust Edit's success response.
- Run `npx graphify hook-rebuild` if the PostToolUse hook did not already fire.
