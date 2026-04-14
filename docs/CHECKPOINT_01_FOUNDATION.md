# Checkpoint 01: Repo Safety + Cookie Session Foundation

Date: 2026-04-13

## Scope
- Added browser-safe cookie-session support on top of the existing auth system.
- Added CSRF protection for authenticated mutating user routes.
- Introduced versioned auth endpoints under `/api/v1/auth/*`.
- Migrated the frontend auth/session path toward cookie-backed browser auth while keeping bearer fallback during transition.

## Included changes
- Backend session cookies and CSRF helpers in `api/deps.py`
- Versioned auth routes and logout/me endpoints in `api/auth.py`
- Cookie/session config in `src/settings.py` and `.env.example`
- Frontend API client updated for `withCredentials` and automatic `X-CSRF-Token`
- Frontend auth/session flow updated to use `/api/v1/auth/*`
- Job detail workspace writes moved onto the shared authenticated API client

## Verification target
- Backend imports compile
- Frontend lint/build pass
- Login/signup create a usable browser session
- Authenticated PATCH/PUT/DELETE calls include CSRF automatically

## Notes
- This checkpoint does not finish the full `/api/v1` migration for onboarding/jobs yet.
- Bearer token fallback remains temporarily to keep the app stable while the session migration lands.
