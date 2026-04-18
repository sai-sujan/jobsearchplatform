# ClawdBot — Complete Getting Started Guide

> **Who this is for:** Someone who can write code and is comfortable with a terminal,
> but has never built and deployed a full-stack app with a database, background workers,
> and an AI pipeline. Every step is copy-pasteable.
>
> **Estimated time:** 30–45 minutes for the first setup.

---

## 1. PREREQUISITES

### What to Install on Your Machine

Work through these in order. Each one is needed before the next.

---

#### Step 1: Install Homebrew (Mac only — skip if you have it)

Homebrew is a package manager for macOS — it's how you install developer tools.

```bash
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
```

Verify it works:
```bash
brew --version
# Should print something like: Homebrew 4.x.x
```

---

#### Step 2: Install Git

Git is version control — it tracks every change you make to the code. It's like an
infinite undo history for your entire project.

```bash
# Check if you already have it:
git --version

# If not installed:
brew install git

# Configure your identity (used in commit messages):
git config --global user.name "Your Name"
git config --global user.email "your@email.com"
```

---

#### Step 3: Install Python 3.11

Your backend is Python. We use 3.11 specifically because it has the best performance
and compatibility with all the libraries in requirements.txt.

```bash
# Install pyenv (manages multiple Python versions — much better than system Python)
brew install pyenv

# Add pyenv to your shell (copy-paste both lines):
echo 'export PYENV_ROOT="$HOME/.pyenv"' >> ~/.zshrc
echo 'export PATH="$PYENV_ROOT/bin:$PATH"' >> ~/.zshrc
echo 'eval "$(pyenv init -)"' >> ~/.zshrc

# Reload your shell:
source ~/.zshrc

# Install Python 3.11:
pyenv install 3.11.9

# Verify:
python --version
# Should print: Python 3.11.9
```

---

#### Step 4: Install Node.js 20

Node.js is needed to run your React frontend and its build tools.

```bash
# Install nvm (Node Version Manager — same idea as pyenv but for Node)
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash

# Reload your shell:
source ~/.zshrc

# Install Node 20:
nvm install 20
nvm use 20

# Verify:
node --version    # Should print: v20.x.x
npm --version     # Should print: 10.x.x
```

---

#### Step 5: Install Docker Desktop

Docker is the most important tool in this list. Think of Docker like a shipping container
system for software: instead of "it works on my machine but not yours," Docker packages
your app with everything it needs and runs identically everywhere.

Docker Desktop gives you:
- Docker itself (the runtime)
- Docker Compose (to run multiple containers at once)
- A visual dashboard to see what's running

```
1. Download from: https://www.docker.com/products/docker-desktop/
2. Choose "Mac with Apple Silicon" or "Mac with Intel chip"
3. Open the downloaded .dmg and drag Docker to Applications
4. Open Docker from your Applications folder
5. Wait for the whale icon to appear in your menu bar and say "Running"
```

Verify from terminal:
```bash
docker --version
# Should print: Docker version 24.x.x

docker compose version
# Should print: Docker Compose version v2.x.x
```

---

### Accounts to Create

Create these before you start coding. Each one is free to start.

| Service | What it's for | URL | Time |
|---|---|---|---|
| **GitHub** | Host your code, run CI/CD | github.com | 2 min |
| **Anthropic** | Claude API for AI features | console.anthropic.com | 5 min |
| **Google Cloud** | Gmail API for email monitoring | console.cloud.google.com | 10 min |
| **Railway** | Deploy the backend | railway.app | 2 min |
| **Cloudflare** | Frontend hosting + file storage | cloudflare.com | 3 min |
| **Sentry** | Error monitoring | sentry.io | 2 min |

**Priority order:** GitHub → Anthropic → Google Cloud. The others can wait until you
are ready to deploy.

#### Get Your Anthropic API Key

```
1. Go to console.anthropic.com
2. Sign up / Log in
3. Click "API Keys" in the left sidebar
4. Click "Create Key"
5. Copy the key — it starts with "sk-ant-api03-..."
6. SAVE IT SOMEWHERE — you cannot see it again after closing the page
```

#### Set Up Google Cloud for Gmail API

```
1. Go to console.cloud.google.com
2. Click "New Project" at the top
3. Name it "clawdbot-dev" → Create
4. In the left menu: APIs & Services → Library
5. Search "Gmail API" → Click it → Enable
6. Go to: APIs & Services → OAuth consent screen
   - User type: External → Create
   - App name: ClawdBot Dev
   - Support email: your email
   - Click Save and Continue through all steps
7. Go to: APIs & Services → Credentials
   - Click "Create Credentials" → "OAuth 2.0 Client IDs"
   - Application type: Web application
   - Name: ClawdBot Local
   - Authorized redirect URIs: http://localhost:8000/auth/gmail/callback
   - Click Create
8. Download the JSON — it contains your client_id and client_secret
```

---

## 2. PROJECT SETUP (Step by Step)

### Step 1: Navigate to the Project

The project already exists at your clawdbot_automation directory. The main app lives in
the `job-applications` folder.

```bash
cd /Users/saisujan/Desktop/internships_apply/clawdbot_automation/job-applications

# See what's already here:
ls
```

You should see: `api/`, `src/`, `dashboard/`, `requirements.txt`, etc.

---

### Step 2: Set Up the Backend (Python)

#### Create and Activate a Virtual Environment

A virtual environment is like a separate room for your project's Python packages.
Without it, all your Python projects share the same packages, which causes version
conflicts. With it, each project is isolated.

```bash
# Make sure you're in the job-applications directory:
pwd
# Should show: .../job-applications

# Create the virtual environment:
python -m venv venv

# Activate it (do this every time you open a new terminal):
source venv/bin/activate

# Your terminal prompt will change to show (venv) at the start.
# This confirms the virtual environment is active.

# Verify you're using the virtual environment's Python:
which python
# Should show: .../job-applications/venv/bin/python
```

#### Install Python Dependencies

```bash
# With the virtual environment active:
pip install --upgrade pip          # Update pip itself first
pip install -r requirements.txt    # Install all dependencies

# This takes 2-5 minutes the first time.
# If you see any errors, check the troubleshooting section below.

# Install Playwright's browser engine:
playwright install chromium
playwright install-deps chromium
```

#### Create Your Backend .env File

```bash
# Copy the template:
cp .env.example .env

# Open it in your editor:
code .env    # VS Code
# or: nano .env
```

Fill in at minimum these values for local development:
```bash
ANTHROPIC_API_KEY=sk-ant-api03-your-key-here
GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=GOCSPX-your-secret
SECRET_KEY=   # Generate: python -c "import secrets; print(secrets.token_hex(32))"
ENCRYPTION_KEY=  # Generate: python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
```

Everything else can keep its default value for local development.

---

### Step 3: Set Up the Frontend (React)

```bash
# Navigate to the dashboard directory:
cd dashboard

# Install all Node.js packages:
npm install
# This creates the node_modules/ folder. Takes 1-2 minutes.

# Create the frontend environment file:
cp .env.example .env.local  2>/dev/null || echo "VITE_API_URL=http://localhost:8000" > .env.local

# Go back to the main directory:
cd ..
```

---

### Step 4: Start PostgreSQL and Redis with Docker

This single command starts both your database and your message queue:

```bash
# From the job-applications/ directory:
docker compose up postgres redis -d
# -d means "detached" — runs in background so your terminal is free

# Check they started successfully:
docker compose ps
# Both should show "healthy" in the STATUS column

# If you need to see logs:
docker compose logs postgres
docker compose logs redis
```

Wait about 10 seconds after this, then continue.

---

### Step 5: Run Database Migrations

Migrations are SQL scripts that create your database tables. Think of it like setting up
the shelves in a warehouse before you start storing boxes.

```bash
# Make sure your virtual environment is active:
source venv/bin/activate

# Run migrations (creates all tables in the database):
python -m src.migration
# Or, if you use Alembic:
# alembic upgrade head

# Verify tables were created:
docker exec -it clawdbot_postgres psql -U clawdbot -d clawdbot -c "\dt"
# Should list tables: users, jobs, matched_jobs, etc.
```

---

### Step 6: Start Everything

Open three separate terminal windows/tabs. Each service runs in its own terminal so you
can see its logs.

**Terminal 1 — Backend (FastAPI):**
```bash
cd /Users/saisujan/Desktop/internships_apply/clawdbot_automation/job-applications
source venv/bin/activate
uvicorn api.server:app --reload --port 8000

# You should see:
# INFO:     Application startup complete.
# INFO:     Uvicorn running on http://127.0.0.1:8000
```

**Terminal 2 — Celery Worker:**
```bash
cd /Users/saisujan/Desktop/internships_apply/clawdbot_automation/job-applications
source venv/bin/activate
celery -A src.celery_app worker --loglevel=info --concurrency=2

# You should see:
# [tasks]
#   . src.tasks.scraper_tasks.scrape_jobs_task
#   . src.tasks.email_tasks.check_new_emails
#   ...
# celery@your-machine ready.
```

**Terminal 3 — Frontend (React):**
```bash
cd /Users/saisujan/Desktop/internships_apply/clawdbot_automation/job-applications/dashboard
npm run dev

# You should see:
#   VITE v5.x  ready in xxx ms
#   ➜  Local:   http://localhost:5173/
```

Now open your browser to **http://localhost:5173** — you should see the ClawdBot dashboard.

Also check: **http://localhost:8000/docs** — this is FastAPI's auto-generated API
documentation. You can test every endpoint directly from the browser.

---

### Alternative: Run Everything with Docker Compose

If you prefer not to manage multiple terminals, Docker Compose can run everything:

```bash
# From job-applications/:
docker compose up

# This starts ALL services (postgres, redis, backend, celery, frontend) at once.
# Logs from all services appear in the same terminal.

# To rebuild after code changes:
docker compose up --build
```

Note: in Docker mode, hot-reload still works because the source directory is mounted
as a volume.

---

## 3. DEVELOPMENT WORKFLOW

### How to Add a New API Endpoint

Let's say you want to add `GET /api/jobs/{job_id}/notes` to let users save notes on jobs.

**Step 1: Add the database model (if needed)**

```python
# src/models.py — add this class
class JobNote(Base):
    """User notes on a specific job."""
    __tablename__ = "job_notes"

    id       = Column(Integer, primary_key=True)
    user_id  = Column(Integer, ForeignKey("users.id"), nullable=False)
    job_id   = Column(Integer, ForeignKey("jobs.id"), nullable=False)
    content  = Column(Text, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)
```

**Step 2: Create a migration to add the table**

```bash
# If using Alembic:
alembic revision --autogenerate -m "add job_notes table"
alembic upgrade head

# If using your custom migration.py, add the table creation there.
```

**Step 3: Add the Pydantic schema**

```python
# src/schemas/job.py — add these
class JobNoteCreate(BaseModel):
    content: str

class JobNoteSchema(BaseModel):
    id:         int
    job_id:     int
    content:    str
    created_at: datetime

    class Config:
        from_attributes = True
```

**Step 4: Add the endpoint**

```python
# api/jobs.py — add these routes

@router.get("/{job_id}/notes", response_model=list[JobNoteSchema])
async def get_job_notes(
    job_id:       int,
    current_user: User    = Depends(get_current_user),
    db:           Session = Depends(get_db)
):
    """Get all notes for a specific job."""
    notes = db.query(JobNote).filter_by(
        job_id=job_id,
        user_id=current_user.id
    ).order_by(JobNote.created_at.desc()).all()
    return notes

@router.post("/{job_id}/notes", response_model=JobNoteSchema, status_code=201)
async def create_job_note(
    job_id:       int,
    note:         JobNoteCreate,
    current_user: User    = Depends(get_current_user),
    db:           Session = Depends(get_db)
):
    """Add a note to a job."""
    new_note = JobNote(
        job_id=job_id,
        user_id=current_user.id,
        content=note.content
    )
    db.add(new_note)
    db.commit()
    db.refresh(new_note)
    return new_note
```

**Step 5: Register the router (if it's a new file)**

```python
# api/server.py — if you created api/notes.py:
from api.notes import router as notes_router
app.include_router(notes_router, prefix="/api/notes", tags=["notes"])
```

**Step 6: Test it**

Open **http://localhost:8000/docs** — your new endpoint appears automatically.
Or write a test:

```bash
# Quick test with curl:
curl -X POST http://localhost:8000/api/jobs/1/notes \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"content": "Great role, follow up next week"}'
```

---

### How to Add a New React Page

Let's say you want to add a "My Applications" page at `/applications`.

**Step 1: Create the page component**

```bash
# Create the file:
touch /Users/saisujan/Desktop/internships_apply/clawdbot_automation/job-applications/dashboard/src/pages/ApplicationsPage.jsx
```

```jsx
// dashboard/src/pages/ApplicationsPage.jsx
import { useState, useEffect } from "react";
import { apiClient } from "../lib/api";

export default function ApplicationsPage() {
  const [applications, setApplications] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchApplications() {
      try {
        const data = await apiClient.get("/api/jobs?status=applied");
        setApplications(data);
      } catch (error) {
        console.error("Failed to fetch applications:", error);
      } finally {
        setLoading(false);
      }
    }
    fetchApplications();
  }, []);

  if (loading) return <div>Loading...</div>;

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-4">My Applications</h1>
      {applications.length === 0 ? (
        <p>No applications yet. Start applying!</p>
      ) : (
        <ul className="space-y-3">
          {applications.map((job) => (
            <li key={job.id} className="border rounded-lg p-4">
              <h2 className="font-semibold">{job.title}</h2>
              <p className="text-gray-600">{job.company}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
```

**Step 2: Add the route**

```jsx
// dashboard/src/App.jsx — add this import and route
import ApplicationsPage from "./pages/ApplicationsPage";

// Inside your <Routes> block:
<Route path="/applications" element={<ApplicationsPage />} />
```

**Step 3: Add navigation link**

```jsx
// dashboard/src/components/Sidebar.jsx (or wherever your nav is)
<NavLink to="/applications">My Applications</NavLink>
```

**Step 4: Check it**

Open **http://localhost:5173/applications** in your browser. The page should load.
React hot-reloads automatically when you save files — no restart needed.

---

### How to Add a New Celery Task

Let's say you want to add a weekly "summary email" task that summarizes the week's job
activity.

**Step 1: Create the task**

```python
# src/tasks/notification_tasks.py

from src.celery_app import app   # Your Celery app instance
from src.database import SessionLocal
from src import models

@app.task(bind=True, name="send_weekly_summary")
def send_weekly_summary(self, user_id: int):
    """
    Send a weekly email summarizing job application activity.
    Triggered by Celery Beat every Monday morning.
    """
    db = SessionLocal()
    try:
        user = db.query(models.User).filter_by(id=user_id).first()
        if not user:
            return

        # Get this week's stats
        from datetime import datetime, timedelta
        week_ago = datetime.utcnow() - timedelta(days=7)

        jobs_scraped = db.query(models.Job).filter(
            models.Job.user_id == user_id,
            models.Job.created_at >= week_ago
        ).count()

        jobs_applied = db.query(models.Job).filter(
            models.Job.user_id == user_id,
            models.Job.status == "applied",
            models.Job.updated_at >= week_ago
        ).count()

        # Send summary (implement send_email separately)
        print(f"[summary] User {user_id}: {jobs_scraped} scraped, {jobs_applied} applied this week")
        # send_email(user.email, "Your Week in ClawdBot", summary_html)

    finally:
        db.close()
```

**Step 2: Register it with Celery Beat**

```python
# src/celery_app.py — add to beat_schedule
from celery.schedules import crontab

app.conf.beat_schedule = {
    # ... existing tasks ...

    "weekly-summary": {
        "task": "send_weekly_summary",
        "schedule": crontab(day_of_week="monday", hour=9, minute=0),
        "args": [],   # No fixed args — runs for all users separately
    },
}
```

**Step 3: Trigger it manually for testing**

```bash
# In a Python shell (with venv active):
python -c "from src.tasks.notification_tasks import send_weekly_summary; send_weekly_summary.delay(user_id=1)"

# Or: send to the task queue and watch Flower at http://localhost:5555
```

**Step 4: Monitor it in Flower**

Open **http://localhost:5555** to see the task appear in the "Tasks" tab.

---

### How to Run Tests

```bash
# Make sure venv is active:
source venv/bin/activate

# Run all tests:
pytest tests/ -v

# Run tests in a specific file:
pytest tests/test_api.py -v

# Run tests matching a pattern:
pytest tests/ -k "test_job" -v

# Run with test output (print statements visible):
pytest tests/ -v -s

# Run with coverage report:
pytest tests/ --cov=src --cov=api --cov-report=term-missing

# Frontend tests:
cd dashboard
npm test              # Run once
npm run test:watch    # Re-run on file changes
```

---

## 4. IMPLEMENTATION ORDER

Here is the order to build things, and more importantly, **why** this order. Each piece
depends on the piece before it.

---

### 1. Database Models + Migrations

**Build first because:** Everything else reads from or writes to the database. No code
can work without a working database schema.

```
What to build:
- User model + auth tables
- Job model
- ResumeAsset model
- Notification model
- MatchedJob model
- Run initial migration: all tables created
```

**Done when:** `alembic upgrade head` runs without errors and `\dt` in psql shows all tables.

---

### 2. Authentication System

**Build second because:** Every other API endpoint requires `current_user`. You can't
test anything authenticated without auth working.

```
What to build:
- POST /auth/register  → create user
- POST /auth/login     → returns JWT token
- GET  /auth/me        → returns current user info
- JWT middleware (the get_current_user dependency)
```

**Done when:** You can register, login, and get a token that works on protected endpoints.

---

### 3. Resume Upload

**Build third because:** The AI scoring and resume tailoring depend on having a resume
stored. The scraper also needs to know what kind of jobs to look for.

```
What to build:
- POST /resume/upload  → accepts PDF/DOCX, extracts text
- GET  /resume/        → returns current resume info
- Resume text extraction (PyPDF2 for PDF, python-docx for DOCX)
- Store to local filesystem (or R2 in production)
```

**Done when:** You can upload a PDF and the API returns the extracted plain text.

---

### 4. Job Scraping (One Source First)

**Build fourth because:** You need jobs in the database before you can score, filter, or
display them. Start with LinkedIn only — add Indeed/Glassdoor later.

```
What to build:
- POST /scrape/start        → creates a Celery task
- GET  /scrape/status/{id}  → check task progress
- Celery task: LinkedIn scraper (you already have this in src/scraper/)
- Deduplication logic
- ScrapeRun model to track history
```

**Done when:** Pressing a "Scrape" button populates the jobs table with real LinkedIn listings.

---

### 5. AI Scoring Pipeline

**Build fifth because:** Now you have resumes AND jobs — you can actually score matches.

```
What to build:
- Claude API client with caching
- Job match scoring prompt + logic
- Celery task: score_job_task (runs after scraping)
- MatchedJob table populated with scores
- Cost tracking logs
```

**Done when:** After scraping, each job in MatchedJob has a score between 0 and 100.

---

### 6. Frontend Dashboard

**Build sixth because:** Now there is real data to display. Building the frontend before
there's real data means you're constantly making up fake data and rewriting.

```
What to build:
- Job listings page (sorted by score)
- Job detail view with description + score breakdown
- Scrape trigger button + progress indicator
- Resume upload UI
- Authentication (login/register pages)
```

**Done when:** The full scrape-to-display flow works in the browser.

---

### 7. Email Monitoring

**Build seventh because:** This is an independent feature that doesn't block the core
job search flow. Users get value without it — it's an enhancement.

```
What to build:
- Gmail OAuth flow (/auth/gmail/start and /auth/gmail/callback)
- GmailCredential model (store encrypted tokens)
- Celery task: check_new_emails (runs every 15 minutes)
- Email classification with Claude Haiku
- ProcessedEmail model (idempotency)
- Notification creation
```

**Done when:** Connecting Gmail and receiving a test email creates a notification in the database.

---

### 8. Notifications Dashboard

**Build eighth because:** This only makes sense once email monitoring is generating
notifications. The UI is the last mile on top of an already-working system.

```
What to build:
- GET /api/notifications           → list notifications
- PATCH /api/notifications/{id}/read → mark as read
- Frontend: notification bell with unread count
- Frontend: notification panel/dropdown
- Frontend: polling every 30 seconds
```

**Done when:** An interview invite email shows up as an "Urgent" notification in the UI
with a red badge on the bell icon.

---

## 5. COMMON MISTAKES TO AVOID

These are the 10 mistakes almost every beginner makes on their first full-stack project.
Knowing them in advance saves hours of debugging.

---

### Mistake 1: Committing the .env File

**What happens:** Your API keys get published to GitHub. GitHub's security bots find them
and email you, but often attackers find them first and rack up $5,000 in API charges.

**How to avoid:**
```bash
# Add to .gitignore immediately:
echo ".env" >> .gitignore
echo ".env.local" >> .gitignore
echo ".env.production" >> .gitignore

# Verify .env is not tracked:
git status
# .env should NOT appear in the output

# If you already committed it by accident:
git rm --cached .env
git commit -m "remove .env from tracking"
# Then IMMEDIATELY rotate all your API keys
```

---

### Mistake 2: Forgetting to Activate the Virtual Environment

**What happens:** You install packages, they don't appear when you run the code. Or the
wrong Python version runs.

**How to spot it:** Your terminal prompt does NOT start with `(venv)`.

**How to avoid:**
```bash
# Every time you open a new terminal:
source venv/bin/activate

# Check you're in the right environment:
which python
# Should show: .../job-applications/venv/bin/python
```

---

### Mistake 3: Not Waiting for the Database to Be Ready

**What happens:** You start the backend immediately after `docker compose up`, the
backend can't connect to PostgreSQL (which is still starting up), and you get a
`connection refused` error.

**How to avoid:**
```bash
# Wait for the healthy status:
docker compose up postgres redis -d
docker compose ps   # Wait until both show "healthy"

# Then start the backend:
uvicorn api.server:app --reload
```

The `healthcheck` in docker-compose.yml makes `depends_on` wait, but if you run services
manually you need to wait yourself.

---

### Mistake 4: Modifying the Database Directly Instead of Through Migrations

**What happens:** You add a column in the database manually (`ALTER TABLE ...`). Your
teammates and your production server don't have that column. Errors everywhere.

**How to avoid:**
- **Always** add/remove columns through migration files.
- Never use `psql` or a database GUI to change the schema directly.
- Migrations are version-controlled — everyone gets the same schema.

---

### Mistake 5: Calling the Claude API in a Loop Without Rate Limiting or Caching

**What happens:** You scrape 500 jobs, immediately fire 500 Claude API requests at the
same time. You hit the rate limit (HTTP 429), get errors, and potentially spend
unexpected money.

**How to avoid:**
- Always use the Celery task queue for LLM calls — Celery naturally throttles them.
- Add `--concurrency=2` to your Celery worker so at most 2 LLM calls run at once.
- Use prompt caching (cache the resume section).
- Use Haiku for high-volume tasks (scoring), Sonnet only for quality tasks (tailoring).

---

### Mistake 6: Storing Sensitive Data in Local State or Logs

**What happens:** You log the full email body, or the user's raw resume text, to your
terminal. It ends up in log files that get committed to git.

**How to avoid:**
```python
# Bad — full email body in logs:
logger.info(f"Processing email: {full_email_body}")

# Good — just identifiers:
logger.info(f"Processing email message_id={message_id} for user_id={user_id}")
```

Never log: API keys, JWT tokens, passwords, full email content, or full resume text.

---

### Mistake 7: Running Database Queries Inside a Loop

**What happens:** You have a list of 200 jobs and you query the database once per job to
check if it's a duplicate. That's 200 separate database round-trips. This is called the
"N+1 query problem" and makes your app very slow.

**How to avoid:**
```python
# Bad — 200 database queries:
for job in scraped_jobs:
    existing = db.query(Job).filter_by(job_id=job.job_id).first()
    if not existing:
        save_job(job)

# Good — 1 database query:
scraped_job_ids = [job.job_id for job in scraped_jobs]
existing_ids = set(
    row[0] for row in
    db.query(Job.job_id).filter(Job.job_id.in_(scraped_job_ids)).all()
)
new_jobs = [job for job in scraped_jobs if job.job_id not in existing_ids]
for job in new_jobs:
    save_job(job)
```

---

### Mistake 8: Not Handling Celery Task Failures

**What happens:** A scrape task fails silently. You don't know it failed because no
error was logged or displayed. The scrape run record stays "running" forever.

**How to avoid:**
```python
# Always wrap task body in try/except and update status:
@app.task(bind=True, max_retries=3)
def scrape_jobs_task(self, ...):
    run = db.query(ScrapeRun).filter_by(id=scrape_run_id).first()
    try:
        run.status = "running"
        db.commit()
        # ... do work ...
        run.status = "completed"
        db.commit()
    except Exception as exc:
        run.status = "failed"
        run.error_message = str(exc)
        db.commit()
        raise self.retry(exc=exc, countdown=60)
```

Also: always check Flower (http://localhost:5555) when something seems to not be working.

---

### Mistake 9: Hardcoding URLs

**What happens:** You write `http://localhost:8000/api/jobs` in 20 places in the React
code. When you deploy to production, you have to find and replace all 20 of them.

**How to avoid:**
```javascript
// dashboard/src/lib/api.js — one place to define the base URL
const API_BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:8000";

export const apiClient = {
  get: (path) => fetch(`${API_BASE_URL}${path}`).then(r => r.json()),
  post: (path, body) => fetch(`${API_BASE_URL}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  }).then(r => r.json()),
  // ...
};

// In .env.local (development):    VITE_API_URL=http://localhost:8000
// In Cloudflare Pages (production): VITE_API_URL=https://api.yourdomain.com
```

---

### Mistake 10: Building Features Before Testing the Foundation

**What happens:** You build the scraper, email monitoring, AI scoring, and the full
dashboard before verifying that auth and the database work. When you finally test
end-to-end, nothing works and it's impossible to tell which layer is broken.

**How to avoid:**
- Follow the implementation order in Section 4 strictly.
- After each section, verify it works before moving to the next.
- Write at least one test for each major feature as you build it.
- Test end-to-end at each checkpoint: can a user register → login → see their data?

**Verification checklist after each section:**
```
After DB models:      psql \dt shows all tables
After auth:           Postman/curl login returns a valid JWT
After resume upload:  curl upload returns extracted text
After scraping:       Jobs table has rows with real data
After AI scoring:     MatchedJob table has score values
After frontend:       Browser shows real data from the API
After email:          Gmail connect flow works, notifications created
After notifications:  Bell icon shows correct count, clicks work
```

---

## Quick Reference: Common Commands

```bash
# Activate virtual environment (run this in every new terminal):
source venv/bin/activate

# Start just the databases:
docker compose up postgres redis -d

# Start the full backend:
uvicorn api.server:app --reload --port 8000

# Start the Celery worker:
celery -A src.celery_app worker --loglevel=info --concurrency=2

# Start the Celery scheduler (periodic tasks):
celery -A src.celery_app beat --loglevel=info

# Start the frontend:
cd dashboard && npm run dev

# Run all tests:
pytest tests/ -v

# See what's in the database:
docker exec -it clawdbot_postgres psql -U clawdbot -d clawdbot

# Check Celery tasks in a browser:
# http://localhost:5555  (Flower)

# See all API endpoints in a browser:
# http://localhost:8000/docs

# View logs for a Docker service:
docker compose logs backend --follow
docker compose logs celery_worker --follow

# Stop all Docker services:
docker compose down

# Full reset (deletes all data — use carefully):
docker compose down -v

# Generate a secure random key:
python -c "import secrets; print(secrets.token_hex(32))"

# Generate a Fernet encryption key:
python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
```
