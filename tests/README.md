# Job Dashboard — Test Suite

Playwright E2E + API tests + Python unit tests.

## Prerequisites

- Backend running: `cd job-applications && python3 -m api.server`
- Frontend running: `cd job-applications/dashboard && npm run dev`
- Optional when ports differ: `API_URL=http://127.0.0.1:5001 FRONTEND_URL=http://localhost:5174 npm test`

## Setup

```bash
cd job-applications/tests
npm install
npx playwright install chromium
```

## Run all tests

```bash
npm test
```

## Run individual suites

```bash
npm run test:auth        # Auth: signup, login, logout, CSRF
npm run test:onboarding  # Onboarding: resume upload, profile save
npm run test:jobs        # Jobs feed: list, filter, CRUD, isolation
npm run test:security    # Security: path traversal, injection, auth bypass
npm run test:scoring     # Scoring engine (runs Python pytest internally)
npm run test:ui          # Full UI E2E: malicious user, beginner, power user
```

## Python unit tests only

```bash
cd job-applications
pip install pytest
python3 -m pytest tests/test_scoring.py -v
```

## View HTML report

```bash
npm run test:report
```

## Test file map

| File | Covers |
|---|---|
| `auth.spec.js` | Signup, login, logout, session, CSRF, injection |
| `onboarding.spec.js` | Resume upload (file+text), profile save, file format/size |
| `jobs.spec.js` | List, filter, pagination, status, notes, analysis, delete |
| `security.spec.js` | Unauthenticated access, path traversal, data isolation |
| `scoring.spec.js` | Python unit tests for scoring/recommendation engine |
| `ui.spec.js` | Full E2E flows, malicious/beginner/power user personas, perf |
| `helpers.js` | Shared test utilities, fixtures, API helpers |

## Production risks these tests document

| Test | Bug |
|---|---|
| `J11` | Arbitrary status strings should remain rejected or safely ignored |
| `SEC-BF1` | Login currently has no persistent distributed rate limiter |
| `test:scoring` | Skips if `pytest` is not installed locally |
