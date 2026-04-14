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

from datetime import datetime
from typing import Dict, List, Optional

from passlib.context import CryptContext
from sqlalchemy import desc
from sqlalchemy.orm import Session

from src.models import Job, Resume, ResumeAsset, ScrapeRun, SearchConfig, SearchPreset, User, UserProfile

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
) -> List[Job]:
    """Get user's jobs with optional filters."""
    query = db.query(Job).filter(Job.user_id == user_id)

    if status:
        query = query.filter(Job.status == status)
    if source:
        query = query.filter(Job.source == source)

    return query.order_by(desc(Job.date_added)).offset(skip).limit(limit).all()


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
