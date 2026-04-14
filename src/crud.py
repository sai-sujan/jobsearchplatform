"""
CRUD Operations
---------------
Database helper functions for creating, reading, updating, and deleting records.

Usage:
    from src.crud import *
    from src.database import SessionLocal

    db = SessionLocal()
    user = create_user(db, username='admin', password='secret')
    jobs = get_user_jobs(db, user.id, status='applied')
"""

import re
from datetime import datetime
from typing import Callable, Dict, List, Optional, Union

from passlib.context import CryptContext
from sqlalchemy import desc
from sqlalchemy.orm import Session

from src.models import Job, MatchedJob, Resume, ResumeAsset, ScrapeRun, SearchConfig, SearchPreset, User, UserProfile
from src.recommendations import build_current_fit_snapshot

# Password hashing
# Use pbkdf2_sha256 for compatibility with local Python environments where
# bcrypt wheels can be unavailable or mismatched.
pwd_context = CryptContext(schemes=['pbkdf2_sha256'], deprecated='auto')


# ============ USER CRUD ============

def create_user(db: Session, username: str, password: str, full_name: str = None):
    """Create a new user."""
    hashed_password = pwd_context.hash(password)
    user = User(username=username, hashed_password=hashed_password, full_name=full_name)
    db.add(user)
    db.commit()
    db.refresh(user)
    profile = UserProfile(user_id=user.id)
    db.add(profile)
    db.commit()
    db.refresh(user)
    return user


def get_user(db: Session, user_id: int) -> User:
    """Get user by ID."""
    return db.query(User).filter(User.id == user_id).first()


def get_user_by_username(db: Session, username: str) -> User:
    """Get user by username."""
    return db.query(User).filter(User.username == username).first()


def authenticate_user(db: Session, username: str, password: str) -> User:
    """Authenticate user by username and password."""
    user = get_user_by_username(db, username)
    if not user or not pwd_context.verify(password, user.hashed_password):
        return None
    return user


def get_or_create_profile(db: Session, user_id: int) -> UserProfile:
    """Return a user's profile, creating a blank one when needed."""
    profile = db.query(UserProfile).filter(UserProfile.user_id == user_id).first()
    if profile:
        return profile

    profile = UserProfile(user_id=user_id)
    db.add(profile)
    db.commit()
    db.refresh(profile)
    return profile


def update_user_profile(db: Session, user_id: int, **profile_data) -> UserProfile:
    """Update onboarding/profile fields for a user."""
    profile = get_or_create_profile(db, user_id)
    for key, value in profile_data.items():
        if hasattr(profile, key):
            setattr(profile, key, value)
    db.commit()
    db.refresh(profile)
    return profile


def create_resume_asset(
    db: Session,
    user_id: int,
    original_text: str,
    parsed_skills: Optional[List[str]] = None,
    filename: str = None,
    content_type: str = None,
    is_active: bool = True,
) -> ResumeAsset:
    """Create a stored resume text asset for a user."""
    if is_active:
        db.query(ResumeAsset).filter(ResumeAsset.user_id == user_id).update({"is_active": False})

    asset = ResumeAsset(
        user_id=user_id,
        filename=filename,
        content_type=content_type,
        original_text=original_text,
        parsed_skills=parsed_skills or [],
        is_active=is_active,
    )
    db.add(asset)
    db.commit()
    db.refresh(asset)
    return asset


def get_active_resume_asset(db: Session, user_id: int) -> Optional[ResumeAsset]:
    """Return the active resume asset for a user."""
    return (
        db.query(ResumeAsset)
        .filter(ResumeAsset.user_id == user_id, ResumeAsset.is_active == True)
        .order_by(desc(ResumeAsset.created_at))
        .first()
    )


def replace_search_presets(db: Session, user_id: int, presets: List[Dict]) -> List[SearchPreset]:
    """Replace all generated presets for a user with a new set."""
    db.query(SearchPreset).filter(SearchPreset.user_id == user_id).delete()
    created = []
    for index, preset_data in enumerate(presets):
        preset = SearchPreset(
            user_id=user_id,
            label=preset_data["label"],
            role=preset_data["role"],
            keywords=preset_data.get("keywords", []),
            locations=preset_data.get("locations", []),
            work_modes=preset_data.get("work_modes", []),
            employment_types=preset_data.get("employment_types", []),
            industries=preset_data.get("industries", []),
            is_default=bool(index == 0),
        )
        db.add(preset)
        created.append(preset)
    db.commit()
    for preset in created:
        db.refresh(preset)
    return created


def get_search_presets(db: Session, user_id: int) -> List[SearchPreset]:
    """Return search presets for a user."""
    return (
        db.query(SearchPreset)
        .filter(SearchPreset.user_id == user_id)
        .order_by(desc(SearchPreset.is_default), SearchPreset.created_at.asc())
        .all()
    )


# ============ JOB CRUD ============

def create_job(db: Session, user_id: int, **job_data) -> Job:
    """Create a new job."""
    job = Job(user_id=user_id, **job_data)
    db.add(job)
    db.commit()
    db.refresh(job)
    return job


def get_job(db: Session, job_id: int, user_id: int) -> Job:
    """Get job by ID (with user ownership check)."""
    return db.query(Job).filter(
        Job.id == job_id,
        Job.user_id == user_id
    ).first()


def get_user_jobs(
    db: Session,
    user_id: int,
    status: str = None,
    source: str = None,
    skip: int = 0,
    limit: int = 100,
    quality_filters: Optional[Dict] = None,
    sort_key: Optional[Callable[[Job], Union[int, float]]] = None,
) -> List[Job]:
    """Get user's jobs with optional filters."""
    query = db.query(Job).filter(Job.user_id == user_id)

    if status:
        query = query.filter(Job.status == status)
    if source:
        query = query.filter(Job.source == source)

    jobs = query.order_by(desc(Job.date_added)).all()
    filtered_jobs = [job for job in jobs if job_passes_quality_filters(job, quality_filters)]
    if sort_key:
        filtered_jobs.sort(key=sort_key, reverse=True)
    return filtered_jobs[skip:skip + limit]


def count_user_jobs(
    db: Session,
    user_id: int,
    status: str = None,
    source: str = None,
    quality_filters: Optional[Dict] = None,
) -> int:
    """Count user's jobs after quality filtering is applied."""
    return len(
        get_user_jobs(
            db,
            user_id,
            status=status,
            source=source,
            skip=0,
            limit=100000,
            quality_filters=quality_filters,
        )
    )


def job_passes_quality_filters(job: Job, quality_filters: Optional[Dict]) -> bool:
    """Apply user-controlled quality filters to candidate jobs."""
    if not quality_filters:
        return True

    source_labels = {
        "linkedin": "LinkedIn",
        "indeed": "Indeed",
        "glassdoor": "Glassdoor",
        "company site": "Company Site",
        "company": "Company Site",
        "web": "Company Site",
    }

    normalized_source = source_labels.get((job.source or "").strip().lower(), (job.source or "Web").title())
    preferred_sources = quality_filters.get("preferred_sources") or []
    if preferred_sources and normalized_source not in preferred_sources:
        return False

    match_score = int(job.skill_score or job.ats_score or 0)
    minimum_match_score = int(quality_filters.get("minimum_match_score") or 0)
    if match_score < minimum_match_score:
        return False

    include_stretch_roles = bool(quality_filters.get("include_stretch_roles", True))
    tier_text = f"{job.tier or ''} {job.role_type or ''}".lower()
    if not include_stretch_roles and (match_score < max(minimum_match_score, 70) or "stretch" in tier_text or "junior to senior" in tier_text):
        return False

    haystack = build_job_search_text(job)

    if quality_filters.get("hide_staffing_agencies") and looks_like_staffing_job(job, haystack):
        return False

    if quality_filters.get("hide_suspicious_jobs") and looks_suspicious_job(job, haystack):
        return False

    if quality_filters.get("exclude_recruiter_posts") and looks_like_recruiter_post(job, haystack):
        return False

    if quality_filters.get("require_salary_visibility") and not has_salary_signal(job):
        return False

    exclude_keywords = [keyword.strip().lower() for keyword in quality_filters.get("exclude_keywords", []) if keyword.strip()]
    if exclude_keywords and any(keyword in haystack for keyword in exclude_keywords):
        return False

    return True


def build_job_search_text(job: Job) -> str:
    """Build a searchable normalized blob from job fields."""
    fields = [
        job.title or "",
        job.company or "",
        job.location or "",
        job.job_description or "",
        job.search_query or "",
    ]
    return " ".join(fields).lower()


def looks_like_staffing_job(job: Job, haystack: str) -> bool:
    """Flag likely staffing-agency or recruiter middleman listings."""
    staffing_company_keywords = [
        "staffing",
        "recruiting",
        "recruitment",
        "talent",
        "hiring",
        "placement",
        "search group",
        "solutions",
        "consulting",
    ]
    staffing_description_keywords = [
        "our client",
        "for one of our clients",
        "staffing agency",
        "recruitment agency",
        "contract-to-hire",
        "w2 only",
        "corp to corp",
        "third-party",
    ]
    company_text = (job.company or "").lower()
    if any(keyword in company_text for keyword in staffing_company_keywords):
        return True
    return any(keyword in haystack for keyword in staffing_description_keywords)


def looks_suspicious_job(job: Job, haystack: str) -> bool:
    """Flag likely low-trust listings using simple heuristics."""
    suspicious_keywords = [
        "commission only",
        "unpaid",
        "training fee",
        "quick money",
        "whatsapp",
        "telegram",
        "crypto mining",
        "multi level marketing",
        "mlm",
        "pay to apply",
    ]
    if any(keyword in haystack for keyword in suspicious_keywords):
        return True

    if not job.job_link or len(job.job_link.strip()) < 10:
        return True

    return False


def looks_like_recruiter_post(job: Job, haystack: str) -> bool:
    """Flag recruiter-style listings the user may want hidden."""
    recruiter_keywords = [
        "recruiter",
        "sourcer",
        "talent acquisition",
        "hiring immediately",
        "we are hiring for our client",
    ]
    return any(keyword in haystack for keyword in recruiter_keywords)


def has_salary_signal(job: Job) -> bool:
    """Check whether the job appears to expose a salary range."""
    haystack = build_job_search_text(job)
    return bool(re.search(r"\$\s?\d", haystack) or re.search(r"\b\d{2,3}k\b", haystack))


def get_matched_job(db: Session, matched_job_id: int, user_id: int) -> Optional[MatchedJob]:
    """Get a delivered matched job owned by the user."""
    return (
        db.query(MatchedJob)
        .filter(MatchedJob.id == matched_job_id, MatchedJob.user_id == user_id)
        .first()
    )


def get_user_matched_jobs(
    db: Session,
    user_id: int,
    status: str = None,
    source: str = None,
    delivery_status: str = 'active',
    skip: int = 0,
    limit: int = 100,
) -> List[MatchedJob]:
    """Return delivered matched jobs for the user."""
    query = (
        db.query(MatchedJob)
        .join(Job, MatchedJob.job_id == Job.id)
        .filter(MatchedJob.user_id == user_id)
    )

    if delivery_status:
        query = query.filter(MatchedJob.delivery_status == delivery_status)
    if status:
        query = query.filter(MatchedJob.user_status == status)
    if source:
        query = query.filter(Job.source == source.lower())

    return (
        query.order_by(desc(MatchedJob.fit_score), desc(MatchedJob.delivered_at))
        .offset(skip)
        .limit(limit)
        .all()
    )


def count_user_matched_jobs(
    db: Session,
    user_id: int,
    status: str = None,
    source: str = None,
    delivery_status: str = 'active',
) -> int:
    """Count delivered matched jobs for the user."""
    query = (
        db.query(MatchedJob)
        .join(Job, MatchedJob.job_id == Job.id)
        .filter(MatchedJob.user_id == user_id)
    )

    if delivery_status:
        query = query.filter(MatchedJob.delivery_status == delivery_status)
    if status:
        query = query.filter(MatchedJob.user_status == status)
    if source:
        query = query.filter(Job.source == source.lower())

    return query.count()


def sync_user_matched_jobs(db: Session, user_id: int) -> List[MatchedJob]:
    """Materialize the user-facing matched_jobs read model from legacy jobs."""
    profile = get_or_create_profile(db, user_id)
    quality_filters = profile.quality_filters or {}
    all_jobs = get_user_jobs(
        db,
        user_id,
        quality_filters=None,
        skip=0,
        limit=100000,
    )
    existing = {
        matched.job_id: matched
        for matched in db.query(MatchedJob).filter(MatchedJob.user_id == user_id).all()
    }
    active_job_ids = set()

    for job in all_jobs:
        fit_snapshot = build_current_fit_snapshot(job, profile)
        passes_filters = job_passes_quality_filters(job, quality_filters)
        matched_job = existing.get(job.id)
        active_job_ids.add(job.id)

        if matched_job is None:
            matched_job = MatchedJob(
                user_id=user_id,
                job_id=job.id,
                special_interest=bool(job.special_interest),
                notes=job.notes or "",
            )
            db.add(matched_job)

        matched_job.delivery_status = 'active' if passes_filters else 'suppressed'
        matched_job.user_status = job.status or matched_job.user_status or 'not_applied'
        matched_job.fit_score = float(fit_snapshot["overall_fit_score"])
        matched_job.base_skill_score = float(fit_snapshot["base_skill_score"])
        matched_job.industry_boost = float(fit_snapshot["industry_boost"])
        matched_job.industry_fit_label = fit_snapshot["industry_fit_label"] or None
        matched_job.job_industries = fit_snapshot["job_industries"]
        matched_job.matched_industries = fit_snapshot["matched_industries"]
        matched_job.fit_reasons = fit_snapshot["fit_reasons"]
        matched_job.special_interest = bool(job.special_interest)
        matched_job.notes = job.notes or matched_job.notes or ""

    for job_id, matched_job in existing.items():
        if job_id not in active_job_ids:
            matched_job.delivery_status = 'archived'

    db.commit()
    return get_user_matched_jobs(db, user_id, delivery_status='active', skip=0, limit=100000)


def update_matched_job(db: Session, matched_job_id: int, user_id: int, **update_data) -> Optional[MatchedJob]:
    """Update a matched job row."""
    matched_job = get_matched_job(db, matched_job_id, user_id)
    if not matched_job:
        return None

    for key, value in update_data.items():
        if hasattr(matched_job, key):
            setattr(matched_job, key, value)

    db.commit()
    db.refresh(matched_job)
    return matched_job


def update_job(db: Session, job_id: int, user_id: int, **update_data) -> Job:
    """Update a job."""
    job = get_job(db, job_id, user_id)
    if not job:
        return None

    for key, value in update_data.items():
        if hasattr(job, key):
            setattr(job, key, value)

    db.commit()
    db.refresh(job)
    return job


def delete_job(db: Session, job_id: int, user_id: int) -> bool:
    """Delete a job."""
    job = get_job(db, job_id, user_id)
    if not job:
        return False

    db.delete(job)
    db.commit()
    return True


def job_exists_by_link(db: Session, user_id: int, job_link: str) -> bool:
    """Check if a job with the same link already exists for the user."""
    return db.query(Job).filter(
        Job.user_id == user_id,
        Job.job_link == job_link
    ).first() is not None


# ============ RESUME CRUD ============

def create_resume(db: Session, job_id: int, pdf_path: str) -> Resume:
    """Create a new resume for a job."""
    resume = Resume(job_id=job_id, pdf_path=pdf_path)
    db.add(resume)
    db.commit()
    db.refresh(resume)
    return resume


def get_job_resumes(db: Session, job_id: int) -> list[Resume]:
    """Get all resumes for a job."""
    return db.query(Resume).filter(Resume.job_id == job_id).order_by(desc(Resume.version)).all()


def get_latest_resume(db: Session, job_id: int) -> Resume:
    """Get the latest resume for a job."""
    return db.query(Resume).filter(Resume.job_id == job_id).order_by(desc(Resume.version)).first()


# ============ SEARCH CONFIG CRUD ============

def create_search_config(db: Session, user_id: int, **config_data) -> SearchConfig:
    """Create a new search configuration."""
    config = SearchConfig(user_id=user_id, **config_data)
    db.add(config)
    db.commit()
    db.refresh(config)
    return config


def get_user_search_configs(db: Session, user_id: int) -> list[SearchConfig]:
    """Get all search configs for a user."""
    return db.query(SearchConfig).filter(SearchConfig.user_id == user_id).all()


def get_active_search_configs(db: Session, user_id: int) -> list[SearchConfig]:
    """Get active search configs for a user."""
    return db.query(SearchConfig).filter(
        SearchConfig.user_id == user_id,
        SearchConfig.is_active == True
    ).all()


def update_search_config(db: Session, config_id: int, user_id: int, **update_data) -> SearchConfig:
    """Update a search configuration."""
    config = db.query(SearchConfig).filter(
        SearchConfig.id == config_id,
        SearchConfig.user_id == user_id
    ).first()
    if not config:
        return None

    for key, value in update_data.items():
        if hasattr(config, key):
            setattr(config, key, value)

    db.commit()
    db.refresh(config)
    return config


def delete_search_config(db: Session, config_id: int, user_id: int) -> bool:
    """Delete a search configuration."""
    config = db.query(SearchConfig).filter(
        SearchConfig.id == config_id,
        SearchConfig.user_id == user_id
    ).first()
    if not config:
        return False

    db.delete(config)
    db.commit()
    return True


# ============ SCRAPE RUN CRUD ============

def create_scrape_run(db: Session, user_id: int, **run_data) -> ScrapeRun:
    """Create a new scrape run."""
    run = ScrapeRun(user_id=user_id, **run_data)
    db.add(run)
    db.commit()
    db.refresh(run)
    return run


def get_scrape_run(db: Session, run_id: int, user_id: int) -> ScrapeRun:
    """Get a scrape run by ID."""
    return db.query(ScrapeRun).filter(
        ScrapeRun.id == run_id,
        ScrapeRun.user_id == user_id
    ).first()


def get_user_scrape_runs(db: Session, user_id: int, limit: int = 10) -> list[ScrapeRun]:
    """Get recent scrape runs for a user."""
    return db.query(ScrapeRun).filter(ScrapeRun.user_id == user_id).order_by(desc(ScrapeRun.started_at)).limit(limit).all()


def update_scrape_run(db: Session, run_id: int, user_id: int, **update_data) -> ScrapeRun:
    """Update a scrape run."""
    run = get_scrape_run(db, run_id, user_id)
    if not run:
        return None

    for key, value in update_data.items():
        if hasattr(run, key):
            setattr(run, key, value)

    db.commit()
    db.refresh(run)
    return run
