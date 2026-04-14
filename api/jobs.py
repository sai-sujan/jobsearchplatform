"""
User-facing matched jobs API.
"""

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session

from api.deps import get_current_user, get_db, require_csrf
from src.crud import (
    create_application_event,
    create_resume,
    count_user_matched_jobs,
    get_matched_job,
    get_application_events,
    get_job_resumes,
    get_or_create_profile,
    get_preferred_delivery_origin,
    get_user_matched_jobs,
    sync_user_matched_jobs,
    update_job,
    update_matched_job,
)
from src.ai_match_service import AIMatchError, maybe_enrich_matched_job_with_ai
from src.evaluation.tailor_service import TailorServiceError, generate_tailored_resume_data
from src.resume.workspace_service import (
    WorkspaceResumeGenerationError,
    generate_resume_from_workspace,
)
from src.models import MatchedJob, User
from src.settings import settings

router = APIRouter(prefix="/api", tags=["jobs"])


def get_workspace_matched_skills(matched_job: MatchedJob) -> list[str]:
    """Prefer user-edited workspace skills over the source job snapshot."""
    skills = matched_job.workspace_matched_skills
    if isinstance(skills, list) and skills:
        return [skill for skill in skills if isinstance(skill, str)]
    return matched_job.job.matched_skills or []


def serialize_matched_job(matched_job: MatchedJob) -> dict:
    """Map matched job delivery rows to the frontend shape."""
    job = matched_job.job
    matched_skills = get_workspace_matched_skills(matched_job)
    analysis_data = matched_job.workspace_analysis or job.ai_evaluation or None
    display_location = matched_job.workspace_location or job.location or ""
    display_ats_score = matched_job.workspace_ats_score if matched_job.workspace_ats_score is not None else job.ats_score
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
        "Location": display_location,
        "Source": source_label,
        "Status": matched_job.user_status,
        "Skill Score": match_score,
        "Fit Score": match_score,
        "Base Skill Score": int(matched_job.base_skill_score or 0),
        "Experience Fit": int(matched_job.experience_fit_score or 0) if matched_job.experience_fit_score is not None else None,
        "Resume Match": int(matched_job.resume_match_score or 0) if matched_job.resume_match_score is not None else None,
        "Role Fit": int(matched_job.role_fit_score or 0) if matched_job.role_fit_score is not None else None,
        "Location Fit": int(matched_job.location_fit_score or 0) if matched_job.location_fit_score is not None else None,
        "Freshness Score": int(matched_job.freshness_score or 0) if matched_job.freshness_score is not None else None,
        "Freshness": matched_job.freshness_label or "",
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
        "Delivery Origin": matched_job.delivery_origin,
        "Delivery Status": matched_job.delivery_status,
        "Special Interest": bool(matched_job.special_interest),
        "Notes": matched_job.notes or "",
        "Matched Skills": ", ".join(matched_skills[:8]),
        "Search Query": job.search_query or "",
        "Date Found": matched_job.delivered_at.isoformat() if matched_job.delivered_at else (job.date_added.isoformat() if job.date_added else None),
        "Job Description": job.job_description or "",
        "Link": job.job_link,
        "Resume Path": matched_job.workspace_resume_path or job.resume_path or "",
        "pdf_path": matched_job.workspace_resume_path or job.resume_path or "",
        "ats_score": int(display_ats_score or 0) if display_ats_score is not None else "N/A",
        "Analysis Data": analysis_data,
        "Match": f"{len(matched_skills)}/{max(len(matched_skills), len(job.missing_skills or []) + len(matched_skills), 1)} skills",
    }


def refresh_user_delivery(db: Session, user_id: int) -> None:
    """Fallback refresh from the legacy jobs store only when needed."""
    if not settings.LEGACY_DELIVERY_FALLBACK_ENABLED:
        return

    preferred_origin = get_preferred_delivery_origin(db, user_id)
    if preferred_origin:
        return

    existing_count = count_user_matched_jobs(db, user_id, delivery_status=None)
    if existing_count > 0:
        return

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


def serialize_application_event(event) -> dict:
    """Serialize timeline events for the job detail workspace."""
    return {
        "id": event.id,
        "event_type": event.event_type,
        "old_status": event.old_status or "",
        "new_status": event.new_status or "",
        "actor": event.actor,
        "metadata": event.metadata_json or {},
        "created_at": event.created_at.isoformat() if event.created_at else None,
    }


def serialize_resume(resume) -> dict:
    """Serialize stored resume versions for the matched-job workspace."""
    filename = (resume.pdf_path or "").split("/")[-1] if resume.pdf_path else ""
    return {
        "id": resume.id,
        "version": resume.version,
        "pdf_path": resume.pdf_path,
        "filename": filename,
        "download_url": f"/api/download-resume/{filename}" if filename else "",
        "created_at": resume.created_at.isoformat() if resume.created_at else None,
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
    preferred_origin = get_preferred_delivery_origin(db, user.id)
    matched_jobs = get_user_matched_jobs(
        db,
        user.id,
        status=status,
        source=source,
        preferred_origin=preferred_origin,
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
        preferred_origin=preferred_origin,
    )

    return {
        "jobs": serialized,
        "stats": {
            "total": total_count,
            "good_matches": len([score for score in match_scores if 70 <= score < 90]),
            "perfect_matches": len([score for score in match_scores if score >= 90]),
            "last_updated": "Live",
            "delivery_origin": preferred_origin or "",
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


@router.get("/jobs/{job_id}/events")
def get_job_events(
    job_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Return application timeline events for one delivered job."""
    matched_job = require_matched_job(db, user.id, job_id)
    events = get_application_events(db, matched_job.id)
    return {
        "job_id": matched_job.id,
        "events": [serialize_application_event(event) for event in events],
    }


@router.get("/jobs/{job_id}/resumes")
def get_job_resume_versions(
    job_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Return stored resume versions for one matched job."""
    matched_job = require_matched_job(db, user.id, job_id)
    resumes = get_job_resumes(db, matched_job.job_id)
    return {
        "job_id": matched_job.id,
        "resumes": [serialize_resume(resume) for resume in resumes],
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
    old_status = matched_job.user_status
    update_matched_job(db, job_id, user.id, user_status=status)
    if old_status != status:
        create_application_event(
            db,
            matched_job.id,
            event_type="status_changed",
            old_status=old_status,
            new_status=status,
            actor="user",
        )
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
    refreshed = update_matched_job(
        db,
        job_id,
        user.id,
        workspace_location=payload.location,
        workspace_ats_score=payload.ats_score,
        workspace_matched_skills=matched_skills[:16],
        workspace_analysis=next_ai_evaluation,
    )
    if not refreshed:
        raise HTTPException(status_code=404, detail="Job not found")
    create_application_event(
        db,
        matched_job.id,
        event_type="analysis_updated",
        actor="user",
        metadata_json={
            "location": payload.location,
            "ats_score": payload.ats_score,
            "points_count": len(payload.points or []),
        },
    )

    return {"message": "Analysis updated", "job": serialize_matched_job(refreshed)}


@router.post("/jobs/{job_id}/resume", dependencies=[Depends(require_csrf)])
def generate_job_resume(
    job_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Generate a resume PDF directly from the matched-job workspace."""
    matched_job = require_matched_job(db, user.id, job_id)
    workspace = matched_job.workspace_analysis or {}
    location = matched_job.workspace_location or matched_job.job.location or ""
    tech_stack = workspace.get("tech_stack") or {}
    points = workspace.get("points") or []

    try:
        pdf_path, pdf_url = generate_resume_from_workspace(
            company_name=matched_job.job.company or "Unknown company",
            location=location,
            tech_stack=tech_stack,
            points=points,
        )
    except WorkspaceResumeGenerationError as error:
        raise HTTPException(status_code=500, detail=str(error)) from error

    updated = update_matched_job(
        db,
        job_id,
        user.id,
        workspace_resume_path=pdf_path,
    )
    if not updated:
        raise HTTPException(status_code=404, detail="Job not found")
    resume_record = create_resume(db, matched_job.job_id, pdf_path)
    create_application_event(
        db,
        matched_job.id,
        event_type="resume_generated",
        actor="user",
        metadata_json={
            "resume_version": resume_record.version,
            "pdf_path": pdf_path,
        },
    )

    return {
        "success": True,
        "pdf_url": pdf_url,
        "pdf_path": pdf_path,
        "resume_version": resume_record.version,
        "job": serialize_matched_job(updated),
    }


@router.post("/jobs/{job_id}/tailor", dependencies=[Depends(require_csrf)])
def tailor_job_workspace(
    job_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Generate workspace-tailoring suggestions for a matched job and persist them on the matched job."""
    matched_job = require_matched_job(db, user.id, job_id)
    profile = get_or_create_profile(db, user.id)
    current_workspace = matched_job.workspace_analysis or {}

    try:
        tailored_data = generate_tailored_resume_data(
            matched_job.job.job_description or "",
            candidate_summary=profile.candidate_summary or "",
            current_location=matched_job.workspace_location or matched_job.job.location or "",
            current_tech_stack=current_workspace.get("tech_stack") or {},
            target_roles=profile.target_roles or [],
            seniority=profile.seniority or "",
        )
    except TailorServiceError as error:
        raise HTTPException(status_code=500, detail=str(error)) from error

    next_workspace = {
        "ats_score": tailored_data.get("ats_score"),
        "location": tailored_data.get("location") or matched_job.workspace_location or matched_job.job.location or "",
        "tech_stack": current_workspace.get("tech_stack") or {},
        "suggested_tech_stack": tailored_data.get("tech_stack") or current_workspace.get("suggested_tech_stack") or {},
        "points": tailored_data.get("points") or current_workspace.get("points") or [],
    }
    suggested_skills = []
    for skills in (tailored_data.get("tech_stack") or {}).values():
        if isinstance(skills, list):
            suggested_skills.extend([skill for skill in skills if isinstance(skill, str)])

    updated = update_matched_job(
        db,
        job_id,
        user.id,
        workspace_location=next_workspace["location"],
        workspace_ats_score=tailored_data.get("ats_score"),
        workspace_analysis=next_workspace,
        workspace_matched_skills=suggested_skills[:16] or matched_job.workspace_matched_skills,
    )
    if not updated:
        raise HTTPException(status_code=404, detail="Job not found")
    create_application_event(
        db,
        matched_job.id,
        event_type="tailor_generated",
        actor="user",
        metadata_json={
            "ats_score": tailored_data.get("ats_score"),
            "points_count": len(next_workspace.get("points") or []),
        },
    )

    return {
        "success": True,
        "tailored_data": next_workspace,
        "job": serialize_matched_job(updated),
    }


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
