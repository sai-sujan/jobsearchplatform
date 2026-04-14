"""
Jobs API Endpoints
------------------
REST API for job CRUD operations.

Endpoints:
  GET  /api/jobs               - List all jobs (paginated, filtered)
  GET  /api/jobs/{id}          - Get single job
  PATCH /api/jobs/{id}/status  - Update job status
  PATCH /api/jobs/{id}/interest - Star/unstar job
  PATCH /api/jobs/{id}/notes   - Update job notes
  DELETE /api/jobs/{id}        - Delete job
"""

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session

from api.deps import get_current_user, get_db, require_csrf
from src.crud import count_user_jobs, delete_job, get_job, get_or_create_profile, get_user_jobs, update_job
from src.models import Job, User

router = APIRouter(prefix="/api", tags=["jobs"])


def serialize_job(job: Job) -> dict:
    """Map database jobs to the frontend shape used by the user web app."""
    matched_skills = job.matched_skills or []
    match_score = int(job.skill_score or 0)
    source_labels = {
        "linkedin": "LinkedIn",
        "indeed": "Indeed",
        "glassdoor": "Glassdoor",
        "company": "Company Site",
        "company site": "Company Site",
        "web": "Company Site",
    }
    source_label = source_labels.get((job.source or "").strip().lower(), (job.source or "Web").title())
    tier = job.tier or (
        '🟢 Perfect Match'
        if match_score >= 90
        else '🟡 Good Match'
        if match_score >= 70
        else '🟠 Stretch Goal'
        if match_score >= 50
        else '🔴 Skip'
    )
    return {
        "job_id": f"job_{job.id}",
        "id": job.id,
        "Title": job.title,
        "Company": job.company,
        "Location": job.location or "",
        "Source": source_label,
        "Status": job.status,
        "Skill Score": match_score,
        "Tier": tier,
        "Special Interest": bool(job.special_interest),
        "Notes": job.notes or "",
        "Matched Skills": ", ".join(matched_skills[:8]),
        "Search Query": job.search_query or "",
        "Date Found": job.date_added.isoformat() if job.date_added else None,
        "Job Description": job.job_description or "",
        "Link": job.job_link,
        "Resume Path": job.resume_path or "",
        "pdf_path": job.resume_path or "",
        "ats_score": int(job.ats_score or 0) if job.ats_score is not None else "N/A",
        "Analysis Data": job.ai_evaluation or None,
        "Match": f"{len(matched_skills)}/{max(len(matched_skills), len(job.missing_skills or []) + len(matched_skills), 1)} skills",
    }


# ============ SCHEMAS ============

class JobUpdate(BaseModel):
    status: str = None
    special_interest: bool = None
    notes: str = None

    class Config:
        from_attributes = True


class JobAnalysisUpdate(BaseModel):
    ats_score: Optional[int] = None
    location: str = ''
    tech_stack: dict = {}
    suggested_tech_stack: dict = {}
    points: list[str] = []


class JobResponse(BaseModel):
    id: int
    company: str
    title: str
    job_link: str
    location: str = None
    source: str
    status: str
    skill_score: float = None
    ats_score: float = None
    tier: str = None
    special_interest: bool
    notes: str = None
    date_added: str

    class Config:
        from_attributes = True


# ============ ENDPOINTS ============

@router.get("/jobs")
def list_jobs(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
    status: str = Query(None),
    source: str = Query(None),
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=500),
):
    """Get all jobs (paginated, filtered)."""
    profile = get_or_create_profile(db, user.id)
    quality_filters = profile.quality_filters or {}
    jobs = get_user_jobs(
        db,
        user.id,
        status=status,
        source=source,
        skip=skip,
        limit=limit,
        quality_filters=quality_filters,
    )
    serialized = [serialize_job(job) for job in jobs]
    match_scores = [job.get("Skill Score", 0) for job in serialized]
    total_count = count_user_jobs(
        db,
        user.id,
        status=status,
        source=source,
        quality_filters=quality_filters,
    )

    return {
        "jobs": serialized,
        "stats": {
            "total": total_count,
            "good_matches": len([score for score in match_scores if 70 <= score < 90]),
            "perfect_matches": len([score for score in match_scores if score >= 90]),
            "last_updated": "Live",
        },
        "active_filters": quality_filters,
    }


@router.get("/jobs/{job_id}")
def get_single_job(job_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    """Get a single job by ID."""
    job = get_job(db, job_id, user.id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    return serialize_job(job)


@router.patch("/jobs/{job_id}/status", dependencies=[Depends(require_csrf)])
def update_job_status(
    job_id: int,
    status: str,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Update job application status."""
    job = update_job(db, job_id, user.id, status=status)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    return {"message": "Status updated"}


@router.patch("/jobs/{job_id}/interest", dependencies=[Depends(require_csrf)])
def toggle_job_interest(
    job_id: int,
    special_interest: bool,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Star/unstar a job."""
    job = update_job(db, job_id, user.id, special_interest=special_interest)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    return {"message": "Interest updated"}


@router.patch("/jobs/{job_id}/notes", dependencies=[Depends(require_csrf)])
def update_job_notes(
    job_id: int,
    notes: str,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Update job notes."""
    job = update_job(db, job_id, user.id, notes=notes)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    return {"message": "Notes updated"}


@router.patch("/jobs/{job_id}/analysis", dependencies=[Depends(require_csrf)])
def update_job_analysis(
    job_id: int,
    payload: JobAnalysisUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Persist edited role analysis for the matched job workspace."""
    matched_skills = []
    for category, skills in (payload.tech_stack or {}).items():
        if isinstance(skills, list):
            matched_skills.extend([skill for skill in skills if isinstance(skill, str)])

    next_ai_evaluation = {
        "ats_score": payload.ats_score,
        "location": payload.location,
        "tech_stack": payload.tech_stack or {},
        "suggested_tech_stack": payload.suggested_tech_stack or {},
        "points": payload.points or [],
    }
    job = update_job(
        db,
        job_id,
        user.id,
        location=payload.location,
        ats_score=payload.ats_score,
        matched_skills=matched_skills[:16],
        ai_evaluation=next_ai_evaluation,
    )
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    return {"message": "Analysis updated", "job": serialize_job(job)}


@router.delete("/jobs/{job_id}", dependencies=[Depends(require_csrf)])
def delete_single_job(job_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    """Delete a job."""
    success = delete_job(db, job_id, user.id)
    if not success:
        raise HTTPException(status_code=404, detail="Job not found")
    return {"message": "Job deleted"}


@router.post("/jobs/backup")
def backup_jobs(db: Session = Depends(get_db)):
    """Trigger backup of jobs database."""
    # This is a placeholder for future backup functionality
    return {"message": "Backup triggered"}
