# ClawdBot — Infrastructure & Deployment Guide

> **Who this is for:** A developer setting up the platform for the first time, or planning
> how to deploy it to production. Every decision is explained in plain English.

---

## 1. LOCAL DEVELOPMENT SETUP

### The Big Picture

Your local machine will run six services, all in Docker:

```
┌─────────────────────────────────────────────────────────────────────┐
│  YOUR LAPTOP                                                        │
│                                                                     │
│  ┌──────────────┐   ┌──────────────┐   ┌──────────────────────┐   │
│  │   Frontend   │   │   Backend    │   │   Celery Worker      │   │
│  │  (Vite/React)│   │  (FastAPI)   │   │  (Background tasks)  │   │
│  │  Port: 5173  │   │  Port: 8000  │   │  (no port — queue)   │   │
│  └──────┬───────┘   └──────┬───────┘   └──────────┬───────────┘   │
│         │                  │                        │               │
│         │          ┌───────▼────────────────────────▼──────────┐   │
│         │          │           Redis (message queue)           │   │
│         │          │              Port: 6379                   │   │
│         │          └────────────────────────────────────────────┘   │
│         │                                                           │
│         │          ┌────────────────────────────────────────────┐   │
│         └──────────►      PostgreSQL (database)                 │   │
│                    │         Port: 5432                         │   │
│                    └────────────────────────────────────────────┘   │
│                                                                     │
│                    ┌────────────────────────────────────────────┐   │
│                    │   Flower (Celery monitoring UI)            │   │
│                    │         Port: 5555                         │   │
│                    └────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────┘
```

**One command starts everything:** `docker-compose up`

---

### docker-compose.yml

Place this file at the root of `job-applications/`:

```yaml
# job-applications/docker-compose.yml
#
# Run the whole app locally with:
#   docker-compose up
#
# Run in background (detached):
#   docker-compose up -d
#
# Stop everything:
#   docker-compose down
#
# Stop and delete all data (fresh start):
#   docker-compose down -v

version: "3.9"

services:

  # ─────────────────────────────────────────────────
  # PostgreSQL — Your main database
  # Think of it like a spreadsheet that multiple
  # programs can read/write at the same time.
  # ─────────────────────────────────────────────────
  postgres:
    image: pgvector/pgvector:pg16   # PostgreSQL 16 with pgvector extension (for AI embeddings)
    container_name: clawdbot_postgres
    environment:
      POSTGRES_DB:       ${POSTGRES_DB:-clawdbot}
      POSTGRES_USER:     ${POSTGRES_USER:-clawdbot}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:-clawdbot_dev}
    ports:
      - "5432:5432"    # Host:Container — access from your machine at localhost:5432
    volumes:
      - postgres_data:/var/lib/postgresql/data   # Persist data between restarts
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ${POSTGRES_USER:-clawdbot}"]
      interval: 5s
      timeout: 5s
      retries: 5

  # ─────────────────────────────────────────────────
  # Redis — The message queue
  # Think of it like a bulletin board: the backend
  # posts tasks, Celery workers pick them up.
  # Also used for caching to speed up API responses.
  # ─────────────────────────────────────────────────
  redis:
    image: redis:7-alpine
    container_name: clawdbot_redis
    ports:
      - "6379:6379"
    volumes:
      - redis_data:/data
    command: redis-server --appendonly yes   # Persist data to disk
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 5s
      timeout: 3s
      retries: 5

  # ─────────────────────────────────────────────────
  # Backend — FastAPI server
  # Your main API. Handles HTTP requests from
  # the frontend and creates Celery tasks.
  # ─────────────────────────────────────────────────
  backend:
    build:
      context: .
      dockerfile: Dockerfile.backend
    container_name: clawdbot_backend
    ports:
      - "8000:8000"
    environment:
      DATABASE_URL:       postgresql://${POSTGRES_USER:-clawdbot}:${POSTGRES_PASSWORD:-clawdbot_dev}@postgres:5432/${POSTGRES_DB:-clawdbot}
      REDIS_URL:          redis://redis:6379/0
      ANTHROPIC_API_KEY:  ${ANTHROPIC_API_KEY}
      GOOGLE_CLIENT_ID:   ${GOOGLE_CLIENT_ID}
      GOOGLE_CLIENT_SECRET: ${GOOGLE_CLIENT_SECRET}
      SECRET_KEY:         ${SECRET_KEY:-dev_secret_change_in_production}
      ENVIRONMENT:        development
    volumes:
      - .:/app                          # Mount source code for hot-reload
      - ./resume_uploads:/app/uploads   # Persist uploaded resumes
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy
    command: uvicorn api.server:app --host 0.0.0.0 --port 8000 --reload
    # --reload means: restart automatically when you save a .py file

  # ─────────────────────────────────────────────────
  # Celery Worker — Background task processor
  # Like a factory floor worker who processes
  # jobs from the task queue. Runs scraping,
  # AI scoring, and email checking here.
  # ─────────────────────────────────────────────────
  celery_worker:
    build:
      context: .
      dockerfile: Dockerfile.backend    # Same image as backend
    container_name: clawdbot_celery_worker
    environment:
      DATABASE_URL:      postgresql://${POSTGRES_USER:-clawdbot}:${POSTGRES_PASSWORD:-clawdbot_dev}@postgres:5432/${POSTGRES_DB:-clawdbot}
      REDIS_URL:         redis://redis:6379/0
      ANTHROPIC_API_KEY: ${ANTHROPIC_API_KEY}
      ENVIRONMENT:       development
    volumes:
      - .:/app
      - ./resume_uploads:/app/uploads
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy
    command: celery -A src.celery_app worker --loglevel=info --concurrency=2
    # --concurrency=2 means: process 2 tasks at the same time

  # ─────────────────────────────────────────────────
  # Celery Beat — Task scheduler
  # Like a cron daemon: triggers periodic tasks
  # (e.g., "check emails every 15 minutes").
  # Separate from the worker so they can scale independently.
  # ─────────────────────────────────────────────────
  celery_beat:
    build:
      context: .
      dockerfile: Dockerfile.backend
    container_name: clawdbot_celery_beat
    environment:
      DATABASE_URL: postgresql://${POSTGRES_USER:-clawdbot}:${POSTGRES_PASSWORD:-clawdbot_dev}@postgres:5432/${POSTGRES_DB:-clawdbot}
      REDIS_URL:    redis://redis:6379/0
      ENVIRONMENT:  development
    volumes:
      - .:/app
    depends_on:
      - redis
      - postgres
    command: celery -A src.celery_app beat --loglevel=info

  # ─────────────────────────────────────────────────
  # Flower — Celery monitoring dashboard
  # A web UI at http://localhost:5555 where you can
  # see what tasks are running, queued, or failed.
  # Like a control tower for your background jobs.
  # ─────────────────────────────────────────────────
  flower:
    image: mher/flower:2.0
    container_name: clawdbot_flower
    ports:
      - "5555:5555"
    environment:
      CELERY_BROKER_URL: redis://redis:6379/0
    depends_on:
      - redis
    command: celery flower --broker=redis://redis:6379/0

  # ─────────────────────────────────────────────────
  # Frontend — Vite React app
  # Your user interface. Hot-reloads when you
  # edit React components.
  # ─────────────────────────────────────────────────
  frontend:
    build:
      context: ./dashboard
      dockerfile: Dockerfile.frontend
    container_name: clawdbot_frontend
    ports:
      - "5173:5173"
    environment:
      VITE_API_URL: http://localhost:8000
    volumes:
      - ./dashboard:/app
      - /app/node_modules    # Don't mount host node_modules into container
    command: npm run dev -- --host 0.0.0.0
    # --host 0.0.0.0 makes Vite accessible outside the container

# Named volumes — Docker manages these on your machine
# They persist even when you run "docker-compose down"
# Use "docker-compose down -v" to delete them
volumes:
  postgres_data:
  redis_data:
```

---

### Dockerfile.backend

```dockerfile
# job-applications/Dockerfile.backend
FROM python:3.11-slim

WORKDIR /app

# Install system dependencies
# (playwright needs these browser libs even in headless mode)
RUN apt-get update && apt-get install -y \
    gcc \
    libpq-dev \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Install Python dependencies first (cached layer — only re-runs if requirements.txt changes)
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Install Playwright browser
RUN playwright install chromium
RUN playwright install-deps chromium

# Copy source code
COPY . .

# The actual start command is specified in docker-compose.yml
# so this image can be reused for backend, celery worker, and beat
CMD ["uvicorn", "api.server:app", "--host", "0.0.0.0", "--port", "8000"]
```

---

### Dockerfile.frontend

```dockerfile
# job-applications/dashboard/Dockerfile.frontend
FROM node:20-alpine

WORKDIR /app

# Install dependencies (cached — only re-runs if package.json changes)
COPY package*.json ./
RUN npm install

# Copy source
COPY . .

CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0"]
```

---

### .env.example

Copy this to `.env` and fill in your actual values:

```bash
# job-applications/.env.example
# Copy this file: cp .env.example .env
# Fill in all values before running the app.
# NEVER commit the .env file to git!

# ─────────────────────────────────────────────
# DATABASE
# PostgreSQL connection URL
# Format: postgresql://USER:PASSWORD@HOST:PORT/DBNAME
# ─────────────────────────────────────────────
POSTGRES_USER=clawdbot
POSTGRES_PASSWORD=clawdbot_dev_password_change_me
POSTGRES_DB=clawdbot
DATABASE_URL=postgresql://clawdbot:clawdbot_dev_password_change_me@postgres:5432/clawdbot

# ─────────────────────────────────────────────
# REDIS
# Redis URL for Celery task queue and caching
# ─────────────────────────────────────────────
REDIS_URL=redis://redis:6379/0

# ─────────────────────────────────────────────
# AI / LLM
# Get this from: https://console.anthropic.com/
# ─────────────────────────────────────────────
ANTHROPIC_API_KEY=sk-ant-api03-...

# ─────────────────────────────────────────────
# AUTHENTICATION
# Secret key for signing JWT tokens.
# Generate a secure random key with:
#   python -c "import secrets; print(secrets.token_hex(32))"
# ─────────────────────────────────────────────
SECRET_KEY=change_me_generate_with_python_secrets
JWT_ALGORITHM=HS256
JWT_EXPIRE_MINUTES=10080   # 7 days

# ─────────────────────────────────────────────
# GMAIL API (OAuth 2.0)
# 1. Go to: https://console.cloud.google.com/
# 2. Create a project
# 3. Enable Gmail API
# 4. Create OAuth 2.0 credentials (Web Application type)
# 5. Add redirect URI: http://localhost:8000/auth/gmail/callback
# ─────────────────────────────────────────────
GOOGLE_CLIENT_ID=xxxxxxxxxx.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=GOCSPX-...
GOOGLE_REDIRECT_URI=http://localhost:8000/auth/gmail/callback

# ─────────────────────────────────────────────
# ENCRYPTION
# Used to encrypt OAuth refresh tokens stored in the database.
# Generate with:
#   python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
# ─────────────────────────────────────────────
ENCRYPTION_KEY=...

# ─────────────────────────────────────────────
# FILE STORAGE
# Where uploaded resumes are stored.
# For local dev, files go to ./resume_uploads/
# For production, use Cloudflare R2 (S3-compatible)
# ─────────────────────────────────────────────
STORAGE_BACKEND=local         # "local" or "r2"
LOCAL_UPLOAD_DIR=./uploads

# Cloudflare R2 settings (only needed in production)
R2_ACCOUNT_ID=
R2_ACCESS_KEY_ID=
R2_SECRET_ACCESS_KEY=
R2_BUCKET_NAME=clawdbot-resumes
R2_PUBLIC_URL=https://pub-xxx.r2.dev

# ─────────────────────────────────────────────
# ENVIRONMENT
# "development" enables debug logs and auto-reload
# "production" disables debug, enables strict security
# ─────────────────────────────────────────────
ENVIRONMENT=development

# ─────────────────────────────────────────────
# SENTRY (optional — for production error tracking)
# https://sentry.io — free tier available
# ─────────────────────────────────────────────
SENTRY_DSN=

# ─────────────────────────────────────────────
# CORS ORIGINS
# Comma-separated list of frontend URLs allowed to call the API
# ─────────────────────────────────────────────
CORS_ORIGINS=http://localhost:5173,http://localhost:3000

# ─────────────────────────────────────────────
# RATE LIMITING
# Max API requests per IP per minute
# ─────────────────────────────────────────────
RATE_LIMIT_PER_MINUTE=60

# ─────────────────────────────────────────────
# AI MATCH SETTINGS (existing config from your codebase)
# ─────────────────────────────────────────────
AI_MATCH_MAX_SKILLS=20
AI_MATCH_MAX_RESUME_CHARS=3000
AI_MATCH_MAX_JOB_CHARS=2500
```

---

## 2. PRODUCTION DEPLOYMENT

### Where to Deploy

**Why Railway or Render?**

Building a full-stack app is hard enough. You don't want to also learn AWS EC2, load
balancers, Kubernetes, and SSL certificates on top of that. Railway and Render let you
deploy by connecting your GitHub repo — they handle the server configuration for you.

> Railway is like parking in a garage with an attendant: you hand them the keys
> (your repo), they take care of the parking (server setup, scaling, SSL).

| Service | Railway | Render |
|---|---|---|
| Free tier | $5/month credit | Free (with sleep on inactivity) |
| Ease of use | Excellent (drag-and-drop services) | Good |
| PostgreSQL | Native, easy | Native |
| Redis | Native | Native |
| Auto-deploy from GitHub | Yes | Yes |
| Custom domains | Yes | Yes |

**Recommendation:** Start with Railway. It has the best developer experience for this type
of app and handles PostgreSQL and Redis natively.

---

### What Runs Where (Production Architecture)

```
┌────────────────────────────────────────────────────────────────────────┐
│  PRODUCTION ARCHITECTURE                                               │
│                                                                        │
│  ┌─────────────────────────┐                                           │
│  │   Cloudflare Pages      │  ← Frontend (React build)                │
│  │   clawdbot.pages.dev    │    Free, global CDN, instant deploys      │
│  │   or your-domain.com    │                                           │
│  └────────────┬────────────┘                                           │
│               │ API calls                                              │
│               ▼                                                        │
│  ┌─────────────────────────┐                                           │
│  │   Railway               │                                           │
│  │                         │                                           │
│  │  ┌─────────────────┐    │                                           │
│  │  │ FastAPI Backend │    │  ← API server (your Python code)          │
│  │  │ api.clawdbot.io │    │                                           │
│  │  └────────┬────────┘    │                                           │
│  │           │             │                                           │
│  │  ┌────────▼────────┐    │                                           │
│  │  │  Celery Worker  │    │  ← Background tasks (scraping, AI)        │
│  │  └────────┬────────┘    │                                           │
│  │           │             │                                           │
│  │  ┌────────▼────────┐    │                                           │
│  │  │   PostgreSQL    │    │  ← Database (Railway managed)             │
│  │  └─────────────────┘    │                                           │
│  │                         │                                           │
│  │  ┌─────────────────┐    │                                           │
│  │  │     Redis       │    │  ← Task queue + cache (Railway managed)   │
│  │  └─────────────────┘    │                                           │
│  └─────────────────────────┘                                           │
│                                                                        │
│  ┌─────────────────────────┐                                           │
│  │   Cloudflare R2         │  ← File storage (resumes)                │
│  │   (S3-compatible)       │    Much cheaper than AWS S3               │
│  └─────────────────────────┘                                           │
└────────────────────────────────────────────────────────────────────────┘
```

---

### Step-by-Step: Deploy to Railway + Cloudflare Pages

#### Part 1: Set Up Railway

```
1. Sign up at railway.app (connect with GitHub)

2. Click "New Project" → "Deploy from GitHub repo"
   → Select your clawdbot repo

3. Railway will detect your Dockerfile.backend and deploy the API.

4. Add services to the same project:

   a) PostgreSQL:
      → Click "Add Service" → "Database" → "PostgreSQL"
      → Railway gives you a DATABASE_URL — copy it

   b) Redis:
      → Click "Add Service" → "Database" → "Redis"
      → Railway gives you a REDIS_URL — copy it

   c) Celery Worker:
      → Click "Add Service" → "GitHub Repo" → same repo
      → Set Start Command: celery -A src.celery_app worker --loglevel=info
      → Add the same environment variables as the backend

   d) Celery Beat:
      → Click "Add Service" → "GitHub Repo" → same repo
      → Set Start Command: celery -A src.celery_app beat --loglevel=info

5. Set environment variables for the Backend service:
   → Click on the Backend service → "Variables" tab
   → Add all variables from .env.example with production values
   → The DATABASE_URL and REDIS_URL come from steps 4a and 4b

6. Set a custom domain (optional):
   → Backend service → "Settings" → "Domains"
   → Add: api.yourdomain.com
   → Point a CNAME record at Railway's domain
```

#### Part 2: Set Up Cloudflare Pages (Frontend)

```
1. Build your frontend:
   cd job-applications/dashboard
   npm run build
   # This creates a "dist/" folder with static HTML/CSS/JS

2. Sign up at pages.cloudflare.com

3. Click "Create a project" → "Connect to Git"
   → Select your GitHub repo
   → Set:
     Build command:   npm run build
     Build output:    dist
     Root directory:  job-applications/dashboard

4. Set environment variables in Cloudflare Pages:
   VITE_API_URL = https://api.yourdomain.com   (your Railway backend URL)

5. Every push to main branch auto-deploys the frontend. Done.
```

#### Part 3: Set Up Cloudflare R2 (File Storage)

```
Cloudflare R2 is like Amazon S3 but:
- No egress fees (you don't pay to download files)
- Cheaper storage
- Already on Cloudflare's network (fast if you use Cloudflare Pages)

Setup:
1. Go to cloudflare.com → "R2 Object Storage"
2. Create a bucket: "clawdbot-resumes"
3. Create API token with R2 read+write permissions
4. Copy: Account ID, Access Key ID, Secret Access Key
5. Add these to Railway environment variables

Your file upload code then uses boto3 with R2's S3-compatible endpoint:
endpoint_url = f"https://{R2_ACCOUNT_ID}.r2.cloudflarestorage.com"
```

---

### Production Environment Variables Checklist

These must be set in Railway before the app works in production:

```bash
# Required — app won't start without these
DATABASE_URL          # From Railway PostgreSQL service
REDIS_URL             # From Railway Redis service
SECRET_KEY            # Generate: python -c "import secrets; print(secrets.token_hex(32))"
ANTHROPIC_API_KEY     # From console.anthropic.com
ENCRYPTION_KEY        # Generate with Fernet.generate_key()

# Required for Gmail OAuth
GOOGLE_CLIENT_ID
GOOGLE_CLIENT_SECRET
GOOGLE_REDIRECT_URI   # Set to: https://api.yourdomain.com/auth/gmail/callback

# Required for file uploads
R2_ACCOUNT_ID
R2_ACCESS_KEY_ID
R2_SECRET_ACCESS_KEY
R2_BUCKET_NAME        # "clawdbot-resumes"

# Configure for production
ENVIRONMENT           # "production"
CORS_ORIGINS          # "https://clawdbot.pages.dev,https://yourdomain.com"

# Optional but recommended
SENTRY_DSN            # From sentry.io for error alerts
```

---

## 3. CI/CD PIPELINE (GitHub Actions)

CI/CD stands for Continuous Integration / Continuous Deployment. Think of it like a
quality control checkpoint on an assembly line:

- Every time you push code to GitHub, automated tests run automatically.
- If tests pass, the code deploys to production automatically.
- If tests fail, the deploy is blocked and you get an email.

You never have to manually `ssh` into a server to deploy.

---

### GitHub Actions Workflow

Create this file (GitHub Actions looks for workflows in this exact path):

```yaml
# job-applications/.github/workflows/deploy.yml

name: Test and Deploy

# Trigger: run this workflow on every push to the main branch
on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:

  # ─────────────────────────────────────────────────
  # JOB 1: Run tests
  # This runs first. If tests fail, deploy is cancelled.
  # ─────────────────────────────────────────────────
  test:
    name: Run Tests
    runs-on: ubuntu-latest   # GitHub provides this free Linux server

    services:
      # Spin up a real PostgreSQL for tests (same version as prod)
      postgres:
        image: pgvector/pgvector:pg16
        env:
          POSTGRES_DB:       test_clawdbot
          POSTGRES_USER:     test_user
          POSTGRES_PASSWORD: test_password
        ports:
          - 5432:5432
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5

      redis:
        image: redis:7-alpine
        ports:
          - 6379:6379
        options: >-
          --health-cmd "redis-cli ping"
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5

    steps:
      # 1. Download the code
      - name: Checkout code
        uses: actions/checkout@v4

      # 2. Set up Python
      - name: Set up Python 3.11
        uses: actions/setup-python@v5
        with:
          python-version: "3.11"
          cache: "pip"   # Cache pip packages so install is faster next time

      # 3. Install Python dependencies
      - name: Install backend dependencies
        run: |
          cd job-applications
          pip install -r requirements.txt
          pip install pytest pytest-asyncio httpx

      # 4. Set up Node.js for frontend tests
      - name: Set up Node.js
        uses: actions/setup-node@v4
        with:
          node-version: "20"
          cache: "npm"
          cache-dependency-path: job-applications/dashboard/package-lock.json

      - name: Install frontend dependencies
        run: |
          cd job-applications/dashboard
          npm ci   # "clean install" — uses package-lock.json exactly

      # 5. Run backend tests
      - name: Run backend tests
        env:
          DATABASE_URL:      postgresql://test_user:test_password@localhost:5432/test_clawdbot
          REDIS_URL:         redis://localhost:6379/0
          SECRET_KEY:        test_secret_key_not_for_production
          ENVIRONMENT:       test
          # Never put real API keys in CI — mock them in tests
          ANTHROPIC_API_KEY: test_key_mocked_in_tests
        run: |
          cd job-applications
          python -m pytest tests/ -v --tb=short

      # 6. Run frontend lint + type check
      - name: Lint frontend
        run: |
          cd job-applications/dashboard
          npm run lint

      # 7. Build frontend (catch build errors before deploy)
      - name: Build frontend
        env:
          VITE_API_URL: https://api.clawdbot.io
        run: |
          cd job-applications/dashboard
          npm run build

  # ─────────────────────────────────────────────────
  # JOB 2: Deploy
  # Only runs after tests pass. Only on pushes to main.
  # Pull requests run tests but do NOT deploy.
  # ─────────────────────────────────────────────────
  deploy:
    name: Deploy to Production
    runs-on: ubuntu-latest
    needs: test   # "Wait for 'test' job to succeed before starting"
    if: github.ref == 'refs/heads/main' && github.event_name == 'push'
    # ↑ Only deploy on direct pushes to main (not PRs)

    steps:
      - name: Checkout code
        uses: actions/checkout@v4

      # Deploy backend to Railway
      # Railway auto-deploys when it detects a push to main,
      # so this step just triggers a Railway redeploy via their API.
      - name: Trigger Railway deploy
        env:
          RAILWAY_TOKEN: ${{ secrets.RAILWAY_TOKEN }}
        run: |
          curl -X POST \
            -H "Authorization: Bearer $RAILWAY_TOKEN" \
            https://railway.app/api/v1/deployments/trigger

      # Deploy frontend to Cloudflare Pages
      # Cloudflare Pages also auto-deploys from GitHub,
      # but we can explicitly trigger it here too.
      - name: Deploy frontend to Cloudflare Pages
        uses: cloudflare/pages-action@v1
        with:
          apiToken:    ${{ secrets.CLOUDFLARE_API_TOKEN }}
          accountId:   ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}
          projectName: clawdbot
          directory:   job-applications/dashboard/dist
          gitHubToken: ${{ secrets.GITHUB_TOKEN }}

      # Notify on Slack/Discord when deploy completes (optional)
      - name: Notify deploy success
        if: success()
        run: |
          echo "Deploy successful! Check https://clawdbot.io"
          # Add Slack/Discord webhook call here if you want notifications
```

---

### Secrets to Add in GitHub

Go to: GitHub repo → Settings → Secrets and variables → Actions → New repository secret

```
RAILWAY_TOKEN           → From railway.app → Account → API Tokens
CLOUDFLARE_API_TOKEN    → From cloudflare.com → My Profile → API Tokens
CLOUDFLARE_ACCOUNT_ID   → From cloudflare.com dashboard (top right of R2 page)
```

---

### What Tests to Write Before Deploying

Good tests catch bugs before users do. Here is what matters most for ClawdBot:

```python
# job-applications/tests/test_api.py

import pytest
from fastapi.testclient import TestClient
from unittest.mock import patch, MagicMock

from api.server import app

client = TestClient(app)

class TestHealth:
    """Basic sanity checks — if these fail, something is very wrong."""

    def test_health_endpoint(self):
        response = client.get("/health")
        assert response.status_code == 200
        assert response.json()["status"] == "ok"

class TestAuth:
    """Auth must work before anything else can be tested."""

    def test_register_user(self):
        response = client.post("/auth/register", json={
            "username": "testuser",
            "password": "SecurePass123!"
        })
        assert response.status_code == 201

    def test_login_returns_token(self, test_user):
        response = client.post("/auth/login", json={
            "username": "testuser",
            "password": "SecurePass123!"
        })
        assert response.status_code == 200
        assert "access_token" in response.json()

class TestJobDeduplication:
    """Crucial: we must never save the same job twice."""

    def test_same_job_not_saved_twice(self, db):
        job_data = {
            "title": "Software Engineer",
            "company": "Acme Corp",
            "url": "https://example.com/job/123"
        }
        first  = save_job_if_new(db, user_id=1, job_data=job_data)
        second = save_job_if_new(db, user_id=1, job_data=job_data)

        assert first is not None    # First save works
        assert second is None       # Second save is skipped

class TestEmailClassification:
    """Mock Claude API — we test OUR logic, not Anthropic's."""

    @patch("src.llm.claude_client.call_claude_with_cache")
    def test_interview_email_classified(self, mock_claude):
        mock_claude.return_value = (
            '{"is_job_related": true, "category": "interview_invite", '
            '"importance": "urgent", "action_required": true, "reason": "Interview invite"}',
            {"input_tokens": 100, "output_tokens": 50, "cache_read_tokens": 0}
        )

        result = classify_email(
            subject="Interview Invitation - Software Engineer Role",
            sender="recruiter@company.com",
            preview="We would like to invite you for an interview..."
        )

        assert result["is_job_related"] == True
        assert result["category"] == "interview_invite"
        assert result["importance"] == "urgent"
```

---

## 4. MONITORING AND OBSERVABILITY

### Sentry — "Get an email whenever something crashes"

Sentry is like having a smoke detector for your code. The moment an exception is thrown
in production, Sentry captures it with the full stack trace and emails you. You don't
need to watch server logs manually.

**Setup (5 minutes):**

```
1. Sign up at sentry.io — free tier includes 5,000 errors/month
2. Create a new project → choose "Python" → choose "FastAPI"
3. Copy the DSN (looks like: https://abc123@o123456.ingest.sentry.io/789)
4. Add SENTRY_DSN to your Railway environment variables
```

```python
# api/server.py — Add Sentry to your FastAPI app
import sentry_sdk
from sentry_sdk.integrations.fastapi import FastApiIntegration
from sentry_sdk.integrations.celery import CeleryIntegration
from sentry_sdk.integrations.sqlalchemy import SqlalchemyIntegration
from src.settings import settings

if settings.SENTRY_DSN and settings.ENVIRONMENT == "production":
    sentry_sdk.init(
        dsn=settings.SENTRY_DSN,
        environment=settings.ENVIRONMENT,
        traces_sample_rate=0.1,   # 10% of requests get performance tracing
        integrations=[
            FastApiIntegration(),
            CeleryIntegration(),
            SqlalchemyIntegration(),
        ],
    )
    # Sentry now automatically captures all unhandled exceptions
```

---

### Logging Strategy

The rule is: **log what happened, not just that it happened.**

Bad log: `"Error occurred"`
Good log: `"[scraper] LinkedIn scrape failed for user_id=42: TimeoutError after 30s on page 3"`

```python
# src/logging_config.py
import logging
import json
from datetime import datetime

class JSONFormatter(logging.Formatter):
    """
    Format logs as JSON — easier to search in log management tools.
    Each log line looks like: {"timestamp": "...", "level": "INFO", "message": "...", "user_id": 42}
    """
    def format(self, record):
        log_data = {
            "timestamp": datetime.utcnow().isoformat(),
            "level":     record.levelname,
            "logger":    record.name,
            "message":   record.getMessage(),
        }
        # Include extra fields if provided
        if hasattr(record, "user_id"):
            log_data["user_id"] = record.user_id
        if hasattr(record, "job_id"):
            log_data["job_id"] = record.job_id
        if hasattr(record, "task_id"):
            log_data["task_id"] = record.task_id

        if record.exc_info:
            log_data["exception"] = self.formatException(record.exc_info)

        return json.dumps(log_data)

def setup_logging(level: str = "INFO"):
    handler = logging.StreamHandler()
    handler.setFormatter(JSONFormatter())
    logging.basicConfig(handlers=[handler], level=level)

# What to log (in each layer):
#
# API layer:     Request received, response sent, auth failures
# Scraper:       Scrape started/completed, pages visited, jobs found, errors
# Celery tasks:  Task started, task completed, retry attempts, task failed
# LLM pipeline:  Feature name, model used, tokens used, cost, cache hit/miss
# Email monitor: Emails checked, emails classified, notifications created
```

---

### Health Check Endpoint

A health check is a special endpoint that monitoring services ping every minute. If it
returns 200, everything is fine. If it returns 500 or times out, you get alerted.

```python
# api/health.py
from fastapi import APIRouter
from sqlalchemy import text
from src.database import SessionLocal
import redis as redis_lib
from src.settings import settings

router = APIRouter()

@router.get("/health")
async def health_check():
    """
    Check that all critical services are reachable.
    Called by Railway, Cloudflare, and uptime monitors every minute.
    """
    results = {
        "status": "ok",
        "checks": {}
    }

    # Check database
    try:
        db = SessionLocal()
        db.execute(text("SELECT 1"))
        db.close()
        results["checks"]["database"] = "ok"
    except Exception as e:
        results["checks"]["database"] = f"error: {str(e)}"
        results["status"] = "degraded"

    # Check Redis
    try:
        r = redis_lib.from_url(settings.REDIS_URL)
        r.ping()
        results["checks"]["redis"] = "ok"
    except Exception as e:
        results["checks"]["redis"] = f"error: {str(e)}"
        results["status"] = "degraded"

    status_code = 200 if results["status"] == "ok" else 503
    return JSONResponse(content=results, status_code=status_code)
```

Railway automatically pings `/health` and will restart your service if it fails.

---

## 5. SECURITY CHECKLIST

This is not optional — job seekers are storing OAuth tokens and resume data in ClawdBot.
You are responsible for keeping that safe.

---

### 1. Environment Variables — Never Hardcode Secrets

```python
# BAD — never do this
ANTHROPIC_API_KEY = "sk-ant-api03-realkey"   # Exposed if code is public on GitHub!

# GOOD — always load from environment
from src.settings import settings
key = settings.ANTHROPIC_API_KEY  # Loaded from .env or Railway environment variables
```

Add `.env` to `.gitignore` so you can never accidentally commit it:

```
# .gitignore
.env
.env.local
.env.production
*.pem
*.key
```

---

### 2. CORS Configuration

CORS (Cross-Origin Resource Sharing) is like a guest list for your API. Without it,
any website could make API calls to your backend. With it, only your frontend domain
is allowed.

```python
# api/server.py
from fastapi.middleware.cors import CORSMiddleware
from src.settings import settings

# Parse comma-separated origins from env var
allowed_origins = [origin.strip() for origin in settings.CORS_ORIGINS.split(",")]

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,    # ONLY these domains can call the API
    allow_credentials=True,           # Allow cookies (needed for auth)
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE"],
    allow_headers=["*"],
)

# Development: allow localhost:5173
# Production:  allow https://clawdbot.io only
```

---

### 3. Rate Limiting

Rate limiting prevents abuse — if someone tries to brute-force your login endpoint or
hammer your API, rate limiting cuts them off.

```python
# api/server.py
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded

limiter = Limiter(key_func=get_remote_address)
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# Apply to specific endpoints:
@router.post("/auth/login")
@limiter.limit("5/minute")   # Max 5 login attempts per minute per IP
async def login(request: Request, ...):
    ...

@router.post("/scrape/start")
@limiter.limit("10/hour")    # Max 10 scrape requests per hour per IP
async def start_scrape(request: Request, ...):
    ...
```

---

### 4. File Upload Validation

When users upload resumes, validate everything before touching the file:

```python
# api/resume.py
import magic   # python-magic — detects real file type (not just extension)

ALLOWED_MIME_TYPES = {
    "application/pdf",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",  # .docx
    "application/msword",  # .doc
}
MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024  # 5 MB

@router.post("/resume/upload")
async def upload_resume(
    file: UploadFile,
    current_user: User = Depends(get_current_user)
):
    # 1. Check file size BEFORE reading the whole file
    contents = await file.read(MAX_FILE_SIZE_BYTES + 1)
    if len(contents) > MAX_FILE_SIZE_BYTES:
        raise HTTPException(400, detail="File too large. Maximum size is 5 MB.")

    # 2. Check REAL file type (not just the filename extension)
    # Attackers can rename "malware.exe" to "resume.pdf"
    real_mime = magic.from_buffer(contents[:2048], mime=True)
    if real_mime not in ALLOWED_MIME_TYPES:
        raise HTTPException(400, detail=f"File type not allowed: {real_mime}")

    # 3. Generate a safe filename (never use the user-provided filename directly)
    import uuid
    safe_filename = f"{current_user.id}_{uuid.uuid4().hex}.pdf"

    # 4. Now safe to store
    await store_file(safe_filename, contents)
    return {"filename": safe_filename}
```

---

### 5. SQL Injection Prevention

SQL injection is when a malicious user types SQL code into an input field to delete your
database or steal data. Example: typing `'; DROP TABLE users; --` into a search box.

**SQLAlchemy prevents this automatically** by using parameterized queries — it always
treats user input as data, never as code.

```python
# VULNERABLE (never do this — raw SQL with string formatting):
user_input = request.query_params.get("search")
db.execute(f"SELECT * FROM jobs WHERE title = '{user_input}'")
# If user_input = "'; DROP TABLE jobs; --", your table is gone.

# SAFE (SQLAlchemy parameterized query):
user_input = request.query_params.get("search")
db.query(Job).filter(Job.title.ilike(f"%{user_input}%")).all()
# SQLAlchemy escapes user_input automatically. No SQL injection possible.

# Also safe (explicit parameterized raw SQL):
db.execute(
    text("SELECT * FROM jobs WHERE title ILIKE :search"),
    {"search": f"%{user_input}%"}
)
```

The rule: **never use f-strings to build SQL queries.** Always let SQLAlchemy handle
the query construction.

---

### 6. Security Headers

Add these headers to every response to prevent common browser-based attacks:

```python
# api/server.py
from fastapi.middleware.trustedhost import TrustedHostMiddleware

@app.middleware("http")
async def add_security_headers(request, call_next):
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["X-XSS-Protection"] = "1; mode=block"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    return response
```

---

### Quick Security Checklist

Before deploying to production, verify:

```
[ ] .env is in .gitignore and NOT in the git history
[ ] SECRET_KEY is a random 32-byte hex string (not "dev_secret")
[ ] ENCRYPTION_KEY is a Fernet-generated key
[ ] CORS_ORIGINS only includes your actual domain
[ ] Rate limiting is on the auth and scrape endpoints
[ ] File upload validates MIME type with python-magic
[ ] All raw SQL uses parameterized queries
[ ] SENTRY_DSN is set so you know when errors happen
[ ] HTTPS is enabled (Railway/Cloudflare handle this automatically)
[ ] OAuth refresh tokens are encrypted in the database
```
