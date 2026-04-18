# Data Model: PostgreSQL Schema

## 1. Entities

### `users`
- `id`: uuid (Primary Key)
- `email`: string (Unique)
- `created_at`: timestamp

### `user_profiles`
- `user_id`: uuid (FK to users)
- `resume_raw_text`: text
- `resume_embedding`: vector(384)  -- pgvector. *Note: Dim varies by model (384 for MiniLM, 1536 for OpenAI).*
- `preferences`: jsonb (Target roles, locations, salary)

### `jobs`
- `id`: uuid
- `job_link`: string (Unique)
- `company`: string
- `title`: string
- `description`: text
- `embedding`: vector(384)
- `source`: string (LinkedIn, Indeed)
- `scraped_at`: timestamp

### `job_matches`
- `user_id`: uuid
- `job_id`: uuid
- `fit_score`: float
- `ai_analysis`: jsonb
- `status`: enum (not_applied, applied, interviewing, rejected)
- `tailored_resume_id`: uuid (FK)

### `emails`
- `id`: uuid
- `user_id`: uuid
- `subject`: string
- `received_at`: timestamp
- `category`: string (Interview, Rejection, Generic)
- `summary`: text
- `is_read`: boolean (default false)

## 2. Indices
- `idx_job_embedding`: ivfflat / hnsw on `jobs.embedding`
- `idx_job_link`: unique btree on `jobs.job_link`
- `idx_match_user_status`: btree on `job_matches(user_id, status)`
