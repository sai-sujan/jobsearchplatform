# API Contracts: FastAPI Endpoints

## 1. Authentication (via Supabase)
Prefix: `/auth`
- Handled by Supabase SDK.

## 2. Jobs
Prefix: `/api/v1/jobs`
- `GET /`: List matched jobs with filters.
- `GET /{id}`: Detail view.
- `POST /search`: Trigger background scrape.
- `PATCH /{id}/status`: Update (Applied, Rejected, etc.)

## 3. Resumes / Tailoring
Prefix: `/api/v1/resumes`
- `POST /tailor`: `{ job_id, resume_id }` -> Enqueue Groq task.
- `GET /download/{id}`: Fetch generated PDF via service-redirect.
- `GET /presigned-upload`: Request secure S3 URL for PDF upload.

## 4. Analytics
Prefix: `/api/v1/analytics`
- `GET /stats`: Fetch pipeline throughput and health.

## 5. Emails
Prefix: `/api/v1/notifications`
- `GET /`: Recent extracted notifications.
- `POST /sync`: Force manual email scan.
