# Docker Setup

This runs the FastAPI backend and React dashboard from a fresh clone.

## Quick Start

```bash
cd job-applications
cp .env.docker.example .env.docker
docker compose up --build
```

Open:

- Dashboard: http://localhost:5174
- Backend health check: http://localhost:5001/api/health

## First-Time Configuration

Edit `.env.docker` with your secrets:

- `JWT_SECRET`
- `INTERNAL_API_TOKEN`
- `GEMINI_API_KEY`, `GROQ_API_KEYS`, or `ANTHROPIC_API_KEY` for AI features
- Gmail OAuth values only if you use the opportunity inbox

Put your resume text in:

```text
resume/master_resume.txt
```

If the file does not exist, the backend container creates a placeholder.

## Persisted Local Folders

Docker Compose bind-mounts these folders so your data survives rebuilds:

- `data/` for SQLite, job exports, caches, generated resumes, and backups
- `logs/` for backend logs
- `resume/` for your master resume
- `config/` for editable blacklist, skills, prompts, and job config

## Running Commands

Start the web app:

```bash
docker compose up --build
```

Run the job search automation inside the backend container:

```bash
docker compose run --rm backend python main.py /search_jobs
```

Run tests:

```bash
docker compose run --rm backend pytest
docker compose run --rm dashboard npm test
```

Stop everything:

```bash
docker compose down
```

## LinkedIn / Browser Note

The backend image installs Playwright Chromium. In Docker, `USE_EXISTING_CHROME=False`
uses the container browser instead of your host Chrome profile. LinkedIn sessions from
your host machine are not automatically shared with the container.
