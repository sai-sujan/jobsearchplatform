from fastapi import FastAPI, Depends, HTTPException, BackgroundTasks
from sqlalchemy.orm import Session
from src.database import get_db, init_db
from src.models import Job, UserProfile
from typing import List
from pydantic import BaseModel

app = FastAPI(title="Job Application Automation API")

@app.on_event("startup")
def on_startup():
    init_db()

class SearchRequest(BaseModel):
    keywords: str
    location: str
    user_id: int

@app.get("/health")
def health_check():
    return {"status": "healthy"}

@app.post("/jobs/search")
def run_search(request: SearchRequest, background_tasks: BackgroundTasks, db: Session = Depends(get_db)):
    """
    Triggers an async LinkedIn scrape workflow via Celery (mocked with BackgroundTasks for MVP API integration).
    Returns a 202 Accepted.
    """
    # Later this will use Celery `task_ingest_jobs.delay()`
    return {"status": "processing", "message": f"Search queued for {request.keywords}"}

@app.post("/jobs/{job_id}/tailor")
def tailor_resume(job_id: int, user_id: int, db: Session = Depends(get_db)):
    """
    Enqueues an AI resume optimization job.
    """
    from src.worker import process_ai_tailor
    process_ai_tailor.delay(job_id, user_id)
    return {"status": "processing", "message": "Resume tailoring queued."}

@app.get("/jobs", response_model=List[dict])
def list_jobs(user_id: int, db: Session = Depends(get_db)):
    jobs = db.query(Job).filter(Job.user_id == user_id).limit(50).all()
    return [{"id": j.id, "company": j.company, "title": j.title, "status": j.status} for j in jobs]
