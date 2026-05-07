# CareerOS Chrome Extension

Save jobs and autofill applications from any job board — like Simplify, but wired to your CareerOS dashboard.

## Setup

1. Open Chrome → `chrome://extensions/`
2. Enable **Developer mode** (top right)
3. Click **Load unpacked** → select this `extension/` folder
4. Sign in with your CareerOS credentials in the popup

## Features

### Save Job
Visit any job listing on LinkedIn, Indeed, Greenhouse, Lever, Workday, or Ashby.
A right-side **CareerOS job capture panel** appears with the detected role and company. Click **Save to CareerOS** to save it instantly, or click **×** to close the panel.

### Autofill Application
On any application form, a right-side **CareerOS application copilot** appears.
Use the panel to autofill the page, generate a cover letter, save the job, and confirm which account is active.
**Never auto-submits** — always review before clicking Submit.

## Supported Sites (Save)
- LinkedIn
- Indeed
- Greenhouse (`boards.greenhouse.io`, `job-boards.greenhouse.io`)
- Lever (`jobs.lever.co`)
- Workday (`*.myworkdayjobs.com`)
- Ashby (`*.ashbyhq.com`)
- BambooHR, SmartRecruiters, Workable
- Generic JSON-LD `JobPosting` schema fallback (works on most company sites)

## Backend
The extension calls `http://localhost:5001` (your local CareerOS API).
Change the URL in **Settings** (⚙ in popup) if your backend is on a different port.

### Endpoints used
- `POST /api/v1/auth/login` — sign in
- `GET /api/v1/auth/me` — session check
- `POST /api/jobs` — save job
- `GET /api/jobs` — recent jobs
- `GET /api/profile/autofill` — profile data for autofill
