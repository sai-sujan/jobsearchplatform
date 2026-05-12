# Codex Notes

Quick context for future work in this project, so we do not have to rediscover the whole repo each time.

## Project Shape

- Root: `/Users/saisujan/Desktop/internships_apply/clawdbot_automation/job-applications`
- Backend: FastAPI app in `api/server.py`, normally served on `http://localhost:5001`.
- Dashboard: Vite/React app in `dashboard/`, normally served on `http://localhost:5173`.
- Browser extension: `extension/`, with popup, background worker, content scripts, and autofill UI.
- Local backend log: `backend.log`.
- Many generated/cache directories exist, especially `graphify-out/`, `dashboard/graphify-out/`, and `data/ai_cache/`; avoid scanning them unless needed.

## Autofill Flow

- Extension popup button: `extension/popup/popup.js`.
- Extension background API bridge: `extension/background.js`.
- Autofill content script: `extension/content/autofill.js`.
- Deterministic profile endpoint: `GET /api/profile/autofill` in `api/onboarding.py`.
- AI smart-fill endpoint: `POST /api/ai/smart-fill` in `api/ai.py`.
- Auth is bearer-token capable through `api/deps.py`; CSRF is skipped for bearer auth, so the extension can call mutating routes with `Authorization: Bearer ...`.

Autofill sequence:

1. Content script sends `GET_AUTOFILL_PROFILE`.
2. Background calls `GET /api/profile/autofill`.
3. Content script fills obvious profile fields locally.
4. Remaining fields are sent through `SMART_FILL`.
5. Background calls `POST /api/ai/smart-fill`.

If the panel says `Autofill failed. Check your backend and try again.`, inspect `backend.log` around `/api/profile/autofill` and `/api/ai/smart-fill`.

## Current Autofill Fix

Failure seen on May 5, 2026:

- `GET /api/profile/autofill` returned `200 OK`.
- `POST /api/ai/smart-fill` returned `500 Internal Server Error`.
- Traceback ended with `ModuleNotFoundError: No module named 'anthropic'`.

Root cause:

- `src.llm.providers.__init__` eagerly imported `ClaudeProvider`, which imports the optional `anthropic` SDK.
- Current venv does not have `anthropic` installed, although Groq keys are configured and Anthropic is not needed for form fill.
- After that was fixed, `src/llm/factory.py` also had a constructor mismatch with `ModelRouter`/`TaskDispatcher`.

Files changed:

- `src/llm/providers/__init__.py`: provider exports are now lazy.
- `src/llm/factory.py`: optional providers are imported only when configured, and dispatcher construction matches the local class signatures.
- `extension/content/autofill.js`: the AI fallback phase is guarded so a page-scanning or smart-fill error does not turn a profile-fill run into a generic backend failure. The panel now reports the real browser-side exception.

Useful verification:

```bash
cd /Users/saisujan/Desktop/internships_apply/clawdbot_automation/job-applications
./venv/bin/python - <<'PY'
from src.llm.factory import get_dispatcher
dispatcher = get_dispatcher()
print('dispatcher ok', sorted(dispatcher._providers.keys()))
PY
curl -sS http://127.0.0.1:5001/api/health
```

Note: `pytest` was not installed in the local venv when checked, so Python tests could not be run with `./venv/bin/python -m pytest`.

Chrome extension reminder:

- After editing `extension/content/autofill.js`, reload the unpacked extension in `chrome://extensions`.
- Then refresh the job application tab before testing again; content scripts already injected into the page keep the old code.

## Running / Restarting

Existing startup script:

```bash
cd /Users/saisujan/Desktop/internships_apply/clawdbot_automation/job-applications
./start_dashboard.sh
```

Backend-only restart that worked in this environment:

```bash
cd /Users/saisujan/Desktop/internships_apply/clawdbot_automation/job-applications
screen -dmS careeros-backend bash -lc 'cd /Users/saisujan/Desktop/internships_apply/clawdbot_automation/job-applications && ./venv/bin/python -m api.server > backend.log 2>&1'
```

Check backend:

```bash
lsof -iTCP:5001 -sTCP:LISTEN -n -P
curl -sS http://127.0.0.1:5001/api/health
tail -n 80 backend.log
```

Stop detached backend screen:

```bash
screen -S careeros-backend -X quit
```

## Search Tips

Prefer focused searches:

```bash
rg -n "Autofill failed|smart-fill|profile/autofill|GET_AUTOFILL_PROFILE|SMART_FILL" extension api -S
rg -n "Traceback|ERROR|/api/ai/smart-fill|profile/autofill| 50[0-9]" backend.log logs -S
```

Avoid broad `rg --files` across the full root unless necessary; this repo has large generated/cache output.

## Dirty Worktree Warning

The worktree already had many unrelated modified and untracked files. Do not revert broad changes. Keep edits scoped and inspect any file before changing it.
