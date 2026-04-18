## graphify

This project has a graphify knowledge graph at graphify-out/.

Rules:
- Before answering architecture or codebase questions, read graphify-out/GRAPH_REPORT.md for god nodes and community structure
- If graphify-out/wiki/index.md exists, navigate it instead of reading raw files
- After modifying code files in this session, run `npx graphify hook-rebuild` to keep the graph current

## Project: ClawdBot / CareerOS

React + Vite dashboard in `dashboard/` backed by FastAPI on port 5001. SQLAlchemy + SQLite at `data/jobs.db`. Cookie-session + CSRF + JWT auth. Current branch: `gemini-ai`.

### Stack map
- Frontend entry: `dashboard/src/App.jsx` — routes, auth gate, onboarding gate, top-level mutation handlers (`handleStatusChange`, `handleNotesChange`, `handleTailorJob`, `handleDeleteJob`)
- Pages: `TodaysJobs.jsx`, `AllJobs.jsx` (Discover), `AppliedJobs.jsx`, `TrackerBoard.jsx`, `TailorPage.jsx`, `Settings.jsx`, `AuthPage.jsx`, `OnboardingPage.jsx`
- Helpers: `dashboard/src/lib/jobs.js` — `normalizeStatus`, `getJobId`, `getDisplayMatchScore`, `APPLIED_STATUSES`, `formatCompactDate`, `getSourceLabel`. Always import from here; do not re-derive status/score logic inline.
- API client: `dashboard/src/api/client.js` — axios instance with auth interceptor; use `api.get/post/patch/delete`, not `fetch`.
- Data shape: job fields use mixed-case keys (`Status`, `Company`, `Title`, `Skill Score`, `Date Found`, `Matched Skills`, `Job Type`, `Search Query`) plus lowercase `id`, `notes`, `applied_at`, `date_applied`.

### Working endpoints (do NOT re-invent)
- `GET /api/jobs` — returns `{ jobs, stats }`
- `PATCH /api/jobs/{id}/status?status=...`
- `PATCH /api/jobs/{id}/notes?notes=...`
- `PATCH /api/jobs/{id}/interest`
- `PATCH /api/jobs/{id}/analysis`
- `DELETE /api/jobs/{id}`
- `POST /api/jobs/{id}/tailor`
- `POST /api/jobs/{id}/resume`
- `POST /api/v1/auth/logout`

### Mutation pattern
Always optimistic-update local `jobs` state FIRST, then call the API, then `showToast`. On error, reload via `loadApp()` and toast an error. See `handleStatusChange` in App.jsx as the canonical pattern.

### Status vocabulary
Backend enum: `not_applied | applied | screening | interviewing | accepted | rejected | skipped`. UI labels are derived via `normalizeStatus(Status)` then mapped per page. TrackerBoard columns match this enum 1:1.

### Design tokens
`--bg: #f1f5f9`, `--surface: #fff`, `--border: #e2e8f0`, `--primary: #4f46e5`, `--text: #0f172a`, `--muted: #64748b`. No glassmorphism, no gradients on body. White cards, slate background.

### Rules when editing UI
- Every button must have an `onClick`. No placeholder UI.
- No hardcoded fallback numbers like `{interviewingCount || 3}` — show real zero-state instead.
- Static mock rows (e.g., "Stripe / Figma follow-ups") must be derived from real `jobs` data or replaced with an empty state.
- For notes/text persistence: optimistic local state + onBlur save + dirty indicator. Pattern: see `NotesEditor` in `AllJobs.jsx`.
- Filter dropdowns: use outside-click-to-close pattern. Pattern: see `FilterDropdown` in `AllJobs.jsx`.
- Dynamic charts: compute SVG path from last-7-day buckets of `applied_at`/`date_applied`. Pattern: see `buildSplinePath` in `TodaysJobs.jsx`.

### Non-functional audit (open work)
1. TrackerBoard "+" button → Add-job modal
2. TailorPage → wire to route state / `jobs` prop, hit real `/api/jobs/{id}/tailor` and `/api/jobs/{id}/resume`; remove hardcoded DEFAULT_JD, BASE_RESUME, TAILORED_RESUME, `matchedScore = 78`, `atsScore = 92`
3. AppliedJobs → stat-card deep links, Export CSV, Add New modal, real pagination, dynamic date range, real Upcoming Interviews + Recent Activity

### Before claiming done
- Start the dev server and click through the feature in a browser (the user has repeatedly flagged this).
- Avoid re-reading files you just edited — trust Edit's success response.
- After code changes, run `npx graphify hook-rebuild` from this directory.
