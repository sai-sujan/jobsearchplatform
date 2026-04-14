"""
User-facing matched jobs API.
"""

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session

from api.deps import get_current_user, get_db, require_csrf
from src.crud import (
    count_user_matched_jobs,
    get_matched_job,
    get_or_create_profile,
    get_user_matched_jobs,
    sync_user_matched_jobs,
    update_job,
    update_matched_job,
)
from src.ai_match_service import AIMatchError, maybe_enrich_matched_job_with_ai
from src.models import MatchedJob, User

router = APIRouter(prefix="/api", tags=["jobs"])


def serialize_matched_job(matched_job: MatchedJob) -> dict:
    """Map matched job delivery rows to the frontend shape."""
    job = matched_job.job
    matched_skills = job.matched_skills or []
    match_score = int(matched_job.fit_score or 0)
    source_labels = {
        "linkedin": "LinkedIn",
        "indeed": "Indeed",
        "glassdoor": "Glassdoor",
        "company": "Company Site",
        "company site": "Company Site",
        "web": "Company Site",
    }
    source_label = source_labels.get((job.source or "").strip().lower(), (job.source or "Web").title())
    tier = (
        "🟢 Perfect Match"
        if match_score >= 90
        else "🟡 Good Match"
        if match_score >= 70
        else "🟠 Stretch Goal"
        if match_score >= 50
        else "🔴 Skip"
    )

    return {
        "job_id": f"match_{matched_job.id}",
        "id": matched_job.id,
        "job_record_id": job.id,
        "Title": job.title,
        "Company": job.company,
        "Location": job.location or "",
        "Source": source_label,
        "Status": matched_job.user_status,
        "Skill Score": match_score,
        "Fit Score": match_score,
        "Base Skill Score": int(matched_job.base_skill_score or 0),
        "Experience Fit": int(matched_job.experience_fit_score or 0) if matched_job.experience_fit_score is not None else None,
        "Resume Match": int(matched_job.resume_match_score or 0) if matched_job.resume_match_score is not None else None,
        "Role Fit": int(matched_job.role_fit_score or 0) if matched_job.role_fit_score is not None else None,
        "Location Fit": int(matched_job.location_fit_score or 0) if matched_job.location_fit_score is not None else None,
        "Industry": ", ".join(matched_job.job_industries or []),
        "Industry Fit": matched_job.industry_fit_label or "",
        "Industry Boost": int(matched_job.industry_boost or 0),
        "Matched Industries": ", ".join(matched_job.matched_industries or []),
        "Fit Reasons": matched_job.fit_reasons or [],
        "AI Match Score": int(matched_job.ai_match_score or 0) if matched_job.ai_match_score is not None else None,
        "AI Match Confidence": matched_job.ai_match_confidence or "",
        "AI Match Summary": matched_job.ai_match_summary or "",
        "AI Match Reasons": matched_job.ai_match_reasons or [],
        "Tier": job.tier or tier,
        "Delivery Status": matched_job.delivery_status,
        "Special Interest": bool(matched_job.special_interest),
        "Notes": matched_job.notes or "",
        "Matched Skills": ", ".join(matched_skills[:8]),
        "Search Query": job.search_query or "",
        "Date Found": matched_job.delivered_at.isoformat() if matched_job.delivered_at else (job.date_added.isoformat() if job.date_added else None),
        "Job Description": job.job_description or "",
        "Link": job.job_link,
        "Resume Path": job.resume_path or "",
        "pdf_path": job.resume_path or "",
        "ats_score": int(job.ats_score or 0) if job.ats_score is not None else "N/A",
        "Analysis Data": job.ai_evaluation or None,
        "Match": f"{len(matched_skills)}/{max(len(matched_skills), len(job.missing_skills or []) + len(matched_skills), 1)} skills",
    }


def refresh_user_delivery(db: Session, user_id: int) -> None:
    """Refresh the matched_jobs read model from the current legacy jobs store."""
    sync_user_matched_jobs(db, user_id)


def require_matched_job(db: Session, user_id: int, matched_job_id: int) -> MatchedJob:
    """Return a user's matched job or raise 404."""
    matched_job = get_matched_job(db, matched_job_id, user_id)
    if not matched_job:
        raise HTTPException(status_code=404, detail="Job not found")
    return matched_job


def load_match_intelligence(db: Session, user: User, matched_job: MatchedJob, force: bool = False) -> dict:
    """Return cached or freshly generated AI match intelligence for one matched job."""
    profile = get_or_create_profile(db, user.id)
    resume_asset = next((asset for asset in user.resume_assets if asset.is_active), None)
    try:
        return maybe_enrich_matched_job_with_ai(db, profile, resume_asset, matched_job, force=force)
    except AIMatchError as error:
        return {
            "ai_match_score": int(matched_job.fit_score or 0),
            "confidence": "low",
            "summary": str(error),
            "reasons": matched_job.fit_reasons or [],
            "cached": False,
        }


class JobUpdate(BaseModel):
    status: str = None
    special_interest: bool = None
    notes: str = None

    class Config:
        from_attributes = True


class JobAnalysisUpdate(BaseModel):
    ats_score: Optional[int] = None
    location: str = ""
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


@router.get("/jobs")
def list_jobs(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
    status: str = Query(None),
    source: str = Query(None),
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=500),
):
    """Get delivered matched jobs for the signed-in user."""
    profile = get_or_create_profile(db, user.id)
    refresh_user_delivery(db, user.id)
    matched_jobs = get_user_matched_jobs(
        db,
        user.id,
        status=status,
        source=source,
        skip=skip,
        limit=limit,
    )
    serialized = [serialize_matched_job(matched_job) for matched_job in matched_jobs]
    match_scores = [job.get("Fit Score", 0) for job in serialized]
    total_count = count_user_matched_jobs(
        db,
        user.id,
        status=status,
        source=source,
    )

    return {
        "jobs": serialized,
        "stats": {
            "total": total_count,
            "good_matches": len([score for score in match_scores if 70 <= score < 90]),
            "perfect_matches": len([score for score in match_scores if score >= 90]),
            "last_updated": "Live",
        },
        "active_filters": profile.quality_filters or {},
    }


@router.get("/jobs/{job_id}")
def get_single_job(job_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    """Get a single delivered matched job by ID."""
    refresh_user_delivery(db, user.id)
    matched_job = require_matched_job(db, user.id, job_id)
    return serialize_matched_job(matched_job)


@router.get("/jobs/{job_id}/match-intelligence")
def get_match_intelligence(
    job_id: int,
    force: bool = Query(False),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Return low-token cached AI match intelligence for a single delivered job."""
    refresh_user_delivery(db, user.id)
    matched_job = require_matched_job(db, user.id, job_id)
    result = load_match_intelligence(db, user, matched_job, force=force)
    return {
        "job_id": matched_job.id,
        "match_intelligence": result,
    }


@router.patch("/jobs/{job_id}/status", dependencies=[Depends(require_csrf)])
def update_job_status(
    job_id: int,
    status: str,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Update application status for a delivered matched job."""
    matched_job = require_matched_job(db, user.id, job_id)
    update_job(db, matched_job.job_id, user.id, status=status)
    update_matched_job(db, job_id, user.id, user_status=status)
    return {"message": "Status updated"}


@router.patch("/jobs/{job_id}/interest", dependencies=[Depends(require_csrf)])
def toggle_job_interest(
    job_id: int,
    special_interest: bool,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Star/unstar a delivered matched job."""
    matched_job = require_matched_job(db, user.id, job_id)
    update_job(db, matched_job.job_id, user.id, special_interest=special_interest)
    update_matched_job(db, job_id, user.id, special_interest=special_interest)
    return {"message": "Interest updated"}


@router.patch("/jobs/{job_id}/notes", dependencies=[Depends(require_csrf)])
def update_job_notes(
    job_id: int,
    notes: str,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Update notes for a delivered matched job."""
    matched_job = require_matched_job(db, user.id, job_id)
    update_job(db, matched_job.job_id, user.id, notes=notes)
    update_matched_job(db, job_id, user.id, notes=notes)
    return {"message": "Notes updated"}


@router.patch("/jobs/{job_id}/analysis", dependencies=[Depends(require_csrf)])
def update_job_analysis(
    job_id: int,
    payload: JobAnalysisUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Persist edited role analysis for the matched job workspace."""
    matched_job = require_matched_job(db, user.id, job_id)

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
        matched_job.job_id,
        user.id,
        location=payload.location,
        ats_score=payload.ats_score,
        matched_skills=matched_skills[:16],
        ai_evaluation=next_ai_evaluation,
    )
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    refresh_user_delivery(db, user.id)
    refreshed = require_matched_job(db, user.id, job_id)
    return {"message": "Analysis updated", "job": serialize_matched_job(refreshed)}


@router.delete("/jobs/{job_id}", dependencies=[Depends(require_csrf)])
def delete_single_job(job_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    """Archive a delivered matched job so it no longer appears in the feed."""
    matched_job = update_matched_job(db, job_id, user.id, delivery_status="archived")
    if not matched_job:
        raise HTTPException(status_code=404, detail="Job not found")
    return {"message": "Job archived"}


@router.post("/jobs/backup")
def backup_jobs():
    """Trigger backup of jobs database."""
    return {"message": "Backup triggered"}
