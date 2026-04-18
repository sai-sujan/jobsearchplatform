from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from uuid import UUID
from typing import List
from src.database import get_db
from src.models import MatchedJob, Job
from pydantic import BaseModel

router = APIRouter()

class JobStatusUpdate(BaseModel):
    status: str

@router.get("/")
def list_matched_jobs(user_id: UUID, db: Session = Depends(get_db)):
    """Fetch user-specific matched jobs."""
    jobs = db.query(MatchedJob).filter(MatchedJob.user_id == user_id).all()
    return jobs

@router.get("/{job_id}")
def get_job_detail(job_id: UUID, db: Session = Depends(get_db)):
    job = db.query(Job).filter(Job.id == job_id).first()
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    return job

@router.patch("/{match_id}/status")
def update_job_status(match_id: UUID, update: JobStatusUpdate, db: Session = Depends(get_db)):
    match = db.query(MatchedJob).filter(MatchedJob.id == match_id).first()
    if not match:
        raise HTTPException(status_code=404, detail="Match not found")
    
    match.user_status = update.status
    db.commit()
    return {"status": "updated", "new_status": match.user_status}
