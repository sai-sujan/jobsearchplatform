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
from sqlalchemy import desc, func, or_
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from src.models import ApplicationEvent, Job, MatchedJob, Resume, ResumeAsset, ScrapeRun, SearchConfig, SearchPreset, User, UserProfile
from src.recommendations import build_current_fit_snapshot
from src.settings import settings

# Password hashing
# Use pbkdf2_sha256 for compatibility with local Python environments where
# bcrypt wheels can be unavailable or mismatched.
pwd_context = CryptContext(schemes=['pbkdf2_sha256'], deprecated='auto')


DATA_DOMAIN_PROFILE_TERMS = (
    "ai engineer",
    "artificial intelligence",
    "analytics",
    "applied scientist",
    "data analyst",
    "data science",
    "data scientist",
    "deep learning",
    "machine learning",
    "ml engineer",
    "nlp",
    "research scientist",
)

DATA_DOMAIN_JOB_TERMS = (
    "ai engineer",
    "artificial intelligence",
    "analytics",
    "applied ai",
    "applied scientist",
    "computer vision",
    "data analyst",
    "data science",
    "data scientist",
    "deep learning",
    "forecasting",
    "generative ai",
    "machine learning",
    "ml engineer",
    "nlp",
    "research scientist",
)


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


def get_user(db: Session, user_id: str) -> User:
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


def get_or_create_profile(db: Session, user_id: str) -> UserProfile:
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


def get_active_resume_asset(db: Session, user_id: str) -> Optional[ResumeAsset]:
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


def _joined_lower(parts: List[str]) -> str:
    return " ".join(str(part or "") for part in parts).lower()


def profile_targets_data_domain(profile: UserProfile) -> bool:
    """Return true when a profile is clearly targeting data/ML/AI work."""
    profile_text = _joined_lower([
        " ".join(profile.target_roles or []),
        " ".join(profile.parsed_skills or []),
        profile.candidate_summary or "",
    ])
    return any(term in profile_text for term in DATA_DOMAIN_PROFILE_TERMS)


def job_matches_data_domain(job: Job) -> bool:
    """Return true when a legacy job belongs in the data/ML/AI bootstrap pool."""
    job_text = _joined_lower([
        job.title or "",
        job.search_query or "",
        job.job_description or "",
    ])
    return any(term in job_text for term in DATA_DOMAIN_JOB_TERMS)


def get_largest_legacy_job_owner(db: Session, user_id: int) -> Optional[int]:
    """Find the most useful legacy launcher pool while excluding the requesting user."""
    job_count = func.count(Job.id).label("job_count")
    row = (
        db.query(Job.user_id, job_count)
        .filter(Job.user_id != user_id)
        .group_by(Job.user_id)
        .order_by(desc(job_count))
        .first()
    )
    return row[0] if row else None


def _clone_legacy_job_for_user(db: Session, user_id: int, source_job: Job) -> Job:
    """Copy a launcher job into a user's own job space so workspace state stays isolated."""
    cloned_job = Job(
        user_id=user_id,
        source=(source_job.source or "web").lower(),
        company=source_job.company or "Unknown company",
        title=source_job.title or "Untitled role",
        job_link=source_job.job_link,
        location=source_job.location,
        # Treat bootstrap delivery as newly discovered by this app. Real freshness
        # should come from the internal matcher once that pipeline is connected.
        posting_date=None,
        date_added=datetime.utcnow(),
        job_description=source_job.job_description,
        role_type=source_job.role_type,
        search_query=source_job.search_query,
        is_premium=bool(source_job.is_premium),
        premium_indicators=source_job.premium_indicators,
        skill_score=source_job.skill_score,
        matched_skills=source_job.matched_skills,
        missing_skills=source_job.missing_skills,
        tier=source_job.tier,
        ats_score=source_job.ats_score,
        ai_evaluation=source_job.ai_evaluation,
        status="not_applied",
        special_interest=False,
        notes="",
        is_new=True,
        resume_path=None,
    )
    db.add(cloned_job)
    return cloned_job


def bootstrap_data_domain_jobs_from_legacy_pool(db: Session, user_id: int) -> List[Job]:
    """Seed a fresh data/ML/AI user's feed from the current launcher-owned job pool."""
    profile = get_or_create_profile(db, user_id)
    if not profile_targets_data_domain(profile):
        return []

    if db.query(Job.id).filter(Job.user_id == user_id).first():
        return []

    source_user_id = get_largest_legacy_job_owner(db, user_id)
    if not source_user_id:
        return []

    resume_asset = get_active_resume_asset(db, user_id)
    quality_filters = profile.quality_filters or {}
    existing_links = {
        link
        for (link,) in db.query(Job.job_link).filter(Job.user_id == user_id).all()
        if link
    }
    candidates = []
    source_jobs = (
        db.query(Job)
        .filter(Job.user_id == source_user_id)
        .order_by(desc(Job.date_added), desc(Job.id))
        .limit(3000)
        .all()
    )

    for source_job in source_jobs:
        if not source_job.job_link or source_job.job_link in existing_links:
            continue
        if not job_matches_data_domain(source_job):
            continue

        fit_snapshot = build_current_fit_snapshot(source_job, profile, resume_asset=resume_asset)
        candidate_score = max(
            int(fit_snapshot.get("overall_fit_score") or 0),
            int(source_job.skill_score or 0),
            int(source_job.ats_score or 0),
        )
        if not job_passes_quality_filters(source_job, quality_filters, match_score_override=candidate_score):
            continue

        candidates.append((candidate_score, source_job.date_added or datetime.min, source_job))

    candidates.sort(key=lambda item: (item[0], item[1]), reverse=True)
    cloned_jobs = []
    for _score, _date_added, source_job in candidates[: settings.LEGACY_BOOTSTRAP_MAX_JOBS]:
        if db.query(Job.id).filter(Job.user_id == user_id, Job.job_link == source_job.job_link).first():
            continue

        try:
            with db.begin_nested():
                cloned_job = _clone_legacy_job_for_user(db, user_id, source_job)
                db.flush()
            cloned_jobs.append(cloned_job)
        except IntegrityError:
            # Concurrent first-page requests can both try to bootstrap the same
            # fresh account. The unique user/job link constraint is the source
            # of truth; skip duplicates and keep the request healthy.
            continue
        existing_links.add(source_job.job_link)
    return cloned_jobs


def job_passes_quality_filters(
    job: Job,
    quality_filters: Optional[Dict],
    match_score_override: Optional[int] = None,
) -> bool:
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

    match_score = int(match_score_override if match_score_override is not None else (job.skill_score or job.ats_score or 0))
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


def get_matched_job(db: Session, matched_job_id: str, user_id: str) -> Optional[MatchedJob]:
    """Get a delivered matched job owned by the user."""
    return (
        db.query(MatchedJob)
        .filter(MatchedJob.id == matched_job_id, MatchedJob.user_id == user_id)
        .first()
    )


def _apply_date_range(query, date_range: Optional[str]):
    """Filter a MatchedJob query by delivered_at based on a named range."""
    if not date_range or date_range == 'all':
        return query
    from datetime import datetime, timedelta, timezone
    now = datetime.now(timezone.utc)
    if date_range == 'today':
        cutoff = now.replace(hour=0, minute=0, second=0, microsecond=0)
    elif date_range == 'week':
        cutoff = now - timedelta(days=7)
    elif date_range == 'month':
        cutoff = now - timedelta(days=30)
    else:
        return query
    return query.filter(MatchedJob.delivered_at >= cutoff)


def get_user_matched_jobs(
    db: Session,
    user_id: str,
    status: str = None,
    source: str = None,
    delivery_status: str = 'active',
    preferred_origin: Optional[str] = None,
    date_range: Optional[str] = None,
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
    if preferred_origin:
        query = query.filter(
            or_(
                MatchedJob.delivery_origin == preferred_origin,
                MatchedJob.delivery_origin == 'extension'
            )
        )
    if status:
        query = query.filter(MatchedJob.user_status == status)
    if source:
        query = query.filter(Job.source == source.lower())

    query = _apply_date_range(query, date_range)

    return (
        query.order_by(desc(MatchedJob.fit_score), desc(MatchedJob.delivered_at))
        .offset(skip)
        .limit(limit)
        .all()
    )


def count_user_matched_jobs(
    db: Session,
    user_id: str,
    status: str = None,
    source: str = None,
    delivery_status: str = 'active',
    preferred_origin: Optional[str] = None,
    date_range: Optional[str] = None,
) -> int:
    """Count delivered matched jobs for the user."""
    query = (
        db.query(MatchedJob)
        .join(Job, MatchedJob.job_id == Job.id)
        .filter(MatchedJob.user_id == user_id)
    )

    if delivery_status:
        query = query.filter(MatchedJob.delivery_status == delivery_status)
    if preferred_origin:
        query = query.filter(
            or_(
                MatchedJob.delivery_origin == preferred_origin,
                MatchedJob.delivery_origin == 'extension'
            )
        )
    if status:
        query = query.filter(MatchedJob.user_status == status)
    if source:
        query = query.filter(Job.source == source.lower())

    query = _apply_date_range(query, date_range)

    return query.count()


def get_preferred_delivery_origin(db: Session, user_id: str) -> Optional[str]:
    """Prefer internal delivery when present; otherwise fall back to legacy sync rows."""
    has_internal = (
        db.query(MatchedJob.id)
        .filter(
            MatchedJob.user_id == user_id,
            MatchedJob.delivery_origin == "internal_delivery",
            MatchedJob.delivery_status.in_(["active", "suppressed", "stale"]),
        )
        .first()
    )
    if has_internal:
        return "internal_delivery"
    has_legacy = (
        db.query(MatchedJob.id)
        .filter(
            MatchedJob.user_id == user_id,
            MatchedJob.delivery_origin == "legacy_sync",
            MatchedJob.delivery_status.in_(["active", "suppressed", "stale"]),
        )
        .first()
    )
    if has_legacy:
        return "legacy_sync"
    return None


def _apply_fit_snapshot_to_matched_job(
    matched_job: MatchedJob,
    job: Job,
    fit_snapshot: Dict,
    quality_filters: Optional[Dict],
) -> MatchedJob:
    """Apply scoring and delivery-state decisions to a matched job."""
    passes_filters = job_passes_quality_filters(
        job,
        quality_filters,
        match_score_override=fit_snapshot["overall_fit_score"],
    )
    stale_for_delivery = fit_snapshot.get("stale_for_delivery", False)
    keep_visible = matched_job.user_status in {'applied', 'interviewing', 'accepted'}
    if stale_for_delivery and not keep_visible:
        matched_job.delivery_status = 'stale'
    else:
        matched_job.delivery_status = 'active' if passes_filters else 'suppressed'

    matched_job.fit_score = float(fit_snapshot["overall_fit_score"])
    matched_job.base_skill_score = float(fit_snapshot["base_skill_score"])
    matched_job.industry_boost = float(fit_snapshot["industry_boost"])
    matched_job.experience_fit_score = float(fit_snapshot["experience_fit_score"])
    matched_job.resume_match_score = float(fit_snapshot["resume_match_score"])
    matched_job.role_fit_score = float(fit_snapshot["role_fit_score"])
    matched_job.location_fit_score = float(fit_snapshot["location_fit_score"])
    matched_job.freshness_score = float(fit_snapshot["freshness_score"])
    matched_job.freshness_label = fit_snapshot["freshness_label"] or None
    matched_job.industry_fit_label = fit_snapshot["industry_fit_label"] or None
    matched_job.job_industries = fit_snapshot["job_industries"]
    matched_job.matched_industries = fit_snapshot["matched_industries"]
    matched_job.fit_reasons = fit_snapshot["fit_reasons"]
    return matched_job


def sync_user_matched_jobs(db: Session, user_id: str) -> List[MatchedJob]:
    """Materialize the user-facing matched_jobs read model from legacy jobs."""
    profile = get_or_create_profile(db, user_id)
    resume_asset = get_active_resume_asset(db, user_id)
    quality_filters = profile.quality_filters or {}
    all_jobs = get_user_jobs(
        db,
        user_id,
        quality_filters=None,
        skip=0,
        limit=100000,
    )
    if not all_jobs:
        bootstrap_data_domain_jobs_from_legacy_pool(db, user_id)
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
        fit_snapshot = build_current_fit_snapshot(job, profile, resume_asset=resume_asset)
        matched_job = existing.get(job.id)
        active_job_ids.add(job.id)

        if matched_job is None:
            matched_job = MatchedJob(
                user_id=user_id,
                job_id=job.id,
                delivery_origin='legacy_sync',
                user_status=job.status or 'not_applied',
                special_interest=bool(job.special_interest),
                notes=job.notes or "",
                workspace_location=job.location,
                workspace_ats_score=job.ats_score,
                workspace_matched_skills=job.matched_skills or [],
                workspace_analysis=job.ai_evaluation,
            )
            db.add(matched_job)
        else:
            matched_job.delivery_origin = matched_job.delivery_origin or 'legacy_sync'

        _apply_fit_snapshot_to_matched_job(matched_job, job, fit_snapshot, quality_filters)
        matched_job.user_status = matched_job.user_status or job.status or 'not_applied'
        if not matched_job.notes and job.notes:
            matched_job.notes = job.notes
        if not matched_job.special_interest and job.special_interest:
            matched_job.special_interest = bool(job.special_interest)
        if not matched_job.workspace_location and job.location:
            matched_job.workspace_location = job.location
        if matched_job.workspace_ats_score is None and job.ats_score is not None:
            matched_job.workspace_ats_score = job.ats_score
        if not matched_job.workspace_matched_skills and job.matched_skills:
            matched_job.workspace_matched_skills = job.matched_skills
        if matched_job.workspace_analysis is None and job.ai_evaluation is not None:
            matched_job.workspace_analysis = job.ai_evaluation

    for job_id, matched_job in existing.items():
        if job_id not in active_job_ids:
            matched_job.delivery_status = 'archived'

    db.commit()
    return get_user_matched_jobs(db, user_id, delivery_status='active', skip=0, limit=100000)


def update_matched_job(db: Session, matched_job_id: str, user_id: str, **update_data) -> Optional[MatchedJob]:
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


def create_application_event(
    db: Session,
    matched_job_id: str,
    event_type: str,
    old_status: Optional[str] = None,
    new_status: Optional[str] = None,
    actor: str = "user",
    metadata_json: Optional[Dict] = None,
) -> ApplicationEvent:
    """Create a timeline event for a matched job."""
    event = ApplicationEvent(
        matched_job_id=matched_job_id,
        event_type=event_type,
        old_status=old_status,
        new_status=new_status,
        actor=actor,
        metadata_json=metadata_json or {},
    )
    db.add(event)
    db.commit()
    db.refresh(event)
    return event


def upsert_delivered_job_for_user(
    db: Session,
    user_id: int,
    job_data: Dict,
    *,
    preserve_user_state: bool = True,
) -> MatchedJob:
    """Create or update one delivered job for a user via the internal pipeline boundary."""
    profile = get_or_create_profile(db, user_id)
    resume_asset = get_active_resume_asset(db, user_id)
    quality_filters = profile.quality_filters or {}

    job_link = (job_data.get("job_link") or "").strip()
    if not job_link:
        raise ValueError("job_link is required")

    job = (
        db.query(Job)
        .filter(Job.user_id == user_id, Job.job_link == job_link)
        .first()
    )
    if job is None:
        job = Job(
            user_id=user_id,
            job_link=job_link,
            source=(job_data.get("source") or "web").lower(),
            company=job_data.get("company") or "Unknown company",
            title=job_data.get("title") or "Untitled role",
        )
        db.add(job)
        db.flush()

    simple_fields = [
        "company",
        "title",
        "location",
        "job_description",
        "role_type",
        "search_query",
        "tier",
        "ai_evaluation",
        "resume_path",
    ]
    for field in simple_fields:
        if field in job_data and job_data[field] is not None:
            setattr(job, field, job_data[field])

    if job_data.get("source") is not None:
        job.source = str(job_data["source"]).lower()

    for field in ["skill_score", "ats_score"]:
        if field in job_data and job_data[field] is not None:
            setattr(job, field, float(job_data[field]))

    for field in ["matched_skills", "missing_skills", "premium_indicators"]:
        if field in job_data and job_data[field] is not None:
            setattr(job, field, job_data[field])

    for field in ["is_premium", "special_interest", "is_new"]:
        if field in job_data and job_data[field] is not None:
            setattr(job, field, bool(job_data[field]))

    if job_data.get("posting_date") is not None:
        job.posting_date = job_data["posting_date"]
    if job_data.get("date_added") is not None:
        job.date_added = job_data["date_added"]

    incoming_status = job_data.get("status") or "not_applied"
    if not preserve_user_state or not job.status:
        job.status = incoming_status
    if not preserve_user_state and "notes" in job_data:
        job.notes = job_data.get("notes") or ""
    elif job_data.get("notes") and not job.notes:
        job.notes = job_data.get("notes") or ""

    matched_job = (
        db.query(MatchedJob)
        .filter(MatchedJob.user_id == user_id, MatchedJob.job_id == job.id)
        .first()
    )
    if matched_job is None:
        matched_job = MatchedJob(
            user_id=user_id,
            job_id=job.id,
            delivery_origin="internal_delivery",
            user_status=incoming_status,
            special_interest=bool(job.special_interest),
            notes=job.notes or "",
            workspace_location=job.location,
            workspace_ats_score=job.ats_score,
            workspace_matched_skills=job.matched_skills or [],
            workspace_analysis=job.ai_evaluation,
        )
        db.add(matched_job)
        db.flush()
    elif not preserve_user_state:
        matched_job.delivery_origin = "internal_delivery"
        matched_job.user_status = incoming_status
        matched_job.special_interest = bool(job.special_interest)
        matched_job.notes = job.notes or ""
    else:
        matched_job.delivery_origin = "internal_delivery"

    fit_snapshot = build_current_fit_snapshot(job, profile, resume_asset=resume_asset)
    _apply_fit_snapshot_to_matched_job(matched_job, job, fit_snapshot, quality_filters)
    if not matched_job.notes and job.notes:
        matched_job.notes = job.notes
    if not matched_job.special_interest and job.special_interest:
        matched_job.special_interest = bool(job.special_interest)
    if not matched_job.workspace_location and job.location:
        matched_job.workspace_location = job.location
    if matched_job.workspace_ats_score is None and job.ats_score is not None:
        matched_job.workspace_ats_score = job.ats_score
    if not matched_job.workspace_matched_skills and job.matched_skills:
        matched_job.workspace_matched_skills = job.matched_skills
    if matched_job.workspace_analysis is None and job.ai_evaluation is not None:
        matched_job.workspace_analysis = job.ai_evaluation

    db.commit()
    db.refresh(job)
    db.refresh(matched_job)
    return matched_job


def sync_delivered_jobs_for_user(
    db: Session,
    user_id: int,
    delivered_jobs: List[Dict],
    *,
    replace_existing: bool = False,
    preserve_user_state: bool = True,
) -> List[MatchedJob]:
    """Upsert a batch of delivered jobs and optionally archive missing active deliveries."""
    upserted = []
    delivered_links = set()
    for job_data in delivered_jobs:
        matched_job = upsert_delivered_job_for_user(
            db,
            user_id,
            job_data,
            preserve_user_state=preserve_user_state,
        )
        upserted.append(matched_job)
        delivered_links.add(matched_job.job.job_link)

    if replace_existing:
        existing_rows = (
            db.query(MatchedJob)
            .join(Job, MatchedJob.job_id == Job.id)
            .filter(MatchedJob.user_id == user_id, MatchedJob.delivery_status.in_(["active", "suppressed", "stale"]))
            .all()
        )
        for row in existing_rows:
            if row.job.job_link not in delivered_links and row.user_status not in {"applied", "interviewing", "accepted"}:
                row.delivery_status = "archived"
        db.commit()

    return upserted


def get_application_events(db: Session, matched_job_id: int) -> List[ApplicationEvent]:
    """Return timeline events for a matched job, newest first."""
    return (
        db.query(ApplicationEvent)
        .filter(ApplicationEvent.matched_job_id == matched_job_id)
        .order_by(desc(ApplicationEvent.created_at))
        .all()
    )


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

def create_resume(db: Session, job_id: str, pdf_path: str) -> Resume:
    """Create a versioned resume record for a job."""
    latest = get_latest_resume(db, job_id)
    next_version = (latest.version + 1) if latest else 1
    resume = Resume(job_id=job_id, pdf_path=pdf_path, version=next_version)
    db.add(resume)
    db.commit()
    db.refresh(resume)
    return resume


def get_job_resumes(db: Session, job_id: str) -> list[Resume]:
    """Get all resumes for a job."""
    return db.query(Resume).filter(Resume.job_id == job_id).order_by(desc(Resume.version)).all()


def get_latest_resume(db: Session, job_id: str) -> Resume:
    """Get the latest resume for a job."""
    return db.query(Resume).filter(Resume.job_id == job_id).order_by(desc(Resume.version)).first()


# ============ SEARCH CONFIG CRUD ============

def create_search_config(db: Session, user_id: str, **config_data) -> SearchConfig:
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
