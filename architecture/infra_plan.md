# Infrastructure Plan

## 1. Hosting
- **Frontend**: Vercel (Global CDN).
- **Backend API**: Render.com (Native FastAPI).
- **Workers**: Render.com Background Jobs (Instance: **1GB RAM min** to prevent Chromium OOM).

## 2. Persistence & Services
- **Database**: Supabase (PostgreSQL 15+ for pgvector, Row Level Security).
- **Blob Storage (PDFs)**: Supabase Storage (S3-compatible).
- **Caching/Queue**: Upstash Redis (Serverless, low-cost for small/medium scale).

## 3. External Integrations
- **LLM**: Groq (LPU Inference - cheapest/fastest for Llama 3).
- **Email**: Gmail API (Google Cloud OAuth).
- **Scraping**: Playwright on Workers (rotating proxies if required).

## 4. CI/CD
- **GitHub Actions**:
  - Main branch push -> Deployment to Render/Vercel.
  - Pull Request -> Preview deploy + QA Agent smoke tests.
