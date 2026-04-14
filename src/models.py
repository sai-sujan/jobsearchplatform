"""
SQLAlchemy ORM Models
---------------------
Database schema for jobs, users, resumes, and configurations.

Models:
  - User: Authentication accounts
  - UserProfile: Role-aware onboarding profile for each user
  - ResumeAsset: Stored resume text/assets owned by the user
  - SearchPreset: Generated search presets derived from onboarding
  - Job: Legacy/canonical job listings with evaluation and status
  - MatchedJob: User-facing delivered jobs read model
  - Resume: Generated tailored resumes for jobs
  - SearchConfig: Legacy saved search configurations
  - ScrapeRun: Background scraper execution history
"""

from datetime import datetime
from sqlalchemy import Column, Integer, String, Text, DateTime, Boolean, ForeignKey, JSON, Float, UniqueConstraint
from sqlalchemy.orm import relationship
from src.database import Base


class User(Base):
    """User account for authentication."""
    __tablename__ = 'users'

    id = Column(Integer, primary_key=True)
    username = Column(String(50), unique=True, nullable=False, index=True)
    hashed_password = Column(String(255), nullable=False)
    full_name = Column(String(120), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    is_active = Column(Boolean, default=True)

    # Relationships
    profile = relationship('UserProfile', back_populates='user', uselist=False, cascade='all, delete-orphan')
    resume_assets = relationship('ResumeAsset', back_populates='user', cascade='all, delete-orphan')
    search_presets = relationship('SearchPreset', back_populates='user', cascade='all, delete-orphan')
    jobs = relationship('Job', back_populates='user', cascade='all, delete-orphan')
    matched_jobs = relationship('MatchedJob', back_populates='user', cascade='all, delete-orphan')
    search_configs = relationship('SearchConfig', back_populates='user', cascade='all, delete-orphan')
    scrape_runs = relationship('ScrapeRun', back_populates='user', cascade='all, delete-orphan')


class UserProfile(Base):
    """Role-aware onboarding profile and job preferences."""
    __tablename__ = 'user_profiles'

    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey('users.id'), nullable=False, unique=True, index=True)
    target_roles = Column(JSON, nullable=False, default=list)
    seniority = Column(String(50), nullable=True)
    preferred_locations = Column(JSON, nullable=False, default=list)
    work_modes = Column(JSON, nullable=False, default=list)
    employment_types = Column(JSON, nullable=False, default=list)
    industries = Column(JSON, nullable=False, default=list)
    visa_preferences = Column(JSON, nullable=False, default=dict)
    quality_filters = Column(JSON, nullable=False, default=dict)
    salary_expectations = Column(String(120), nullable=True)
    candidate_summary = Column(Text, nullable=True)
    parsed_skills = Column(JSON, nullable=False, default=list)
    onboarding_step = Column(String(50), nullable=False, default='welcome')
    onboarding_completed = Column(Boolean, nullable=False, default=False)
    automation_connected = Column(Boolean, nullable=False, default=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    user = relationship('User', back_populates='profile')


class ResumeAsset(Base):
    """Stored resume text/assets owned by a user."""
    __tablename__ = 'resume_assets'

    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey('users.id'), nullable=False, index=True)
    filename = Column(String(255), nullable=True)
    content_type = Column(String(120), nullable=True)
    original_text = Column(Text, nullable=False)
    parsed_skills = Column(JSON, nullable=False, default=list)
    is_active = Column(Boolean, nullable=False, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    user = relationship('User', back_populates='resume_assets')


class SearchPreset(Base):
    """User-facing search presets generated from onboarding preferences."""
    __tablename__ = 'search_presets'

    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey('users.id'), nullable=False, index=True)
    label = Column(String(120), nullable=False)
    role = Column(String(120), nullable=False)
    keywords = Column(JSON, nullable=False, default=list)
    locations = Column(JSON, nullable=False, default=list)
    work_modes = Column(JSON, nullable=False, default=list)
    employment_types = Column(JSON, nullable=False, default=list)
    industries = Column(JSON, nullable=False, default=list)
    is_default = Column(Boolean, nullable=False, default=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    user = relationship('User', back_populates='search_presets')


class Job(Base):
    """Legacy/canonical job listing with evaluation scores and source metadata."""
    __tablename__ = 'jobs'
    __table_args__ = (
        UniqueConstraint('user_id', 'job_link', name='uq_user_job_link'),
    )

    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey('users.id'), nullable=False, index=True)

    # Job metadata
    source = Column(String(20), nullable=False)  # linkedin, indeed, glassdoor
    company = Column(String(255), nullable=False)
    title = Column(String(255), nullable=False)
    job_link = Column(String(1000), nullable=False, index=True)
    location = Column(String(255), nullable=True)
    posting_date = Column(DateTime, nullable=True)
    date_added = Column(DateTime, default=datetime.utcnow)

    # Job details
    job_description = Column(Text, nullable=True)
    role_type = Column(String(50), nullable=True)  # internship, entry-level, mid-level, etc.
    search_query = Column(String(500), nullable=True)  # The search term that found this job

    # Premium indicators
    is_premium = Column(Boolean, default=False)
    premium_indicators = Column(JSON, nullable=True)  # List of premium signals

    # Evaluation scores
    skill_score = Column(Float, nullable=True)  # 0-100
    matched_skills = Column(JSON, nullable=True)  # List of matched skills
    missing_skills = Column(JSON, nullable=True)  # List of missing skills
    tier = Column(String(20), nullable=True)  # premium, standard, lower, etc.
    ats_score = Column(Float, nullable=True)  # 0-100 ATS compatibility
    ai_evaluation = Column(JSON, nullable=True)  # Full AI evaluation result (inlines old sidecar JSON)

    # Application status
    status = Column(
        String(50),
        nullable=False,
        default='not_applied',
        index=True
    )  # not_applied, applied, interviewing, accepted, rejected, skipped

    # User annotations
    special_interest = Column(Boolean, default=False)  # User starred/bookmarked this job
    notes = Column(Text, nullable=True)  # User notes about the job
    is_new = Column(Boolean, default=True)  # Whether this is a new addition

    # PDF resume path for this job
    resume_path = Column(String(500), nullable=True)  # Path to tailored resume PDF

    # Relationships
    user = relationship('User', back_populates='jobs')
    matched_jobs = relationship('MatchedJob', back_populates='job', cascade='all, delete-orphan')
    resumes = relationship('Resume', back_populates='job', cascade='all, delete-orphan')


class MatchedJob(Base):
    """User-facing delivered job record used by the web app."""
    __tablename__ = 'matched_jobs'
    __table_args__ = (
        UniqueConstraint('user_id', 'job_id', name='uq_user_matched_job'),
    )

    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey('users.id'), nullable=False, index=True)
    job_id = Column(Integer, ForeignKey('jobs.id'), nullable=False, index=True)
    delivery_origin = Column(String(30), nullable=False, default='legacy_sync', index=True)
    delivery_status = Column(String(30), nullable=False, default='active', index=True)
    user_status = Column(String(50), nullable=False, default='not_applied', index=True)
    fit_score = Column(Float, nullable=False, default=0)
    base_skill_score = Column(Float, nullable=False, default=0)
    industry_boost = Column(Float, nullable=False, default=0)
    experience_fit_score = Column(Float, nullable=True)
    resume_match_score = Column(Float, nullable=True)
    role_fit_score = Column(Float, nullable=True)
    location_fit_score = Column(Float, nullable=True)
    freshness_score = Column(Float, nullable=True)
    freshness_label = Column(String(120), nullable=True)
    industry_fit_label = Column(String(120), nullable=True)
    job_industries = Column(JSON, nullable=False, default=list)
    matched_industries = Column(JSON, nullable=False, default=list)
    fit_reasons = Column(JSON, nullable=False, default=list)
    ai_match_score = Column(Float, nullable=True)
    ai_match_confidence = Column(String(20), nullable=True)
    ai_match_summary = Column(Text, nullable=True)
    ai_match_reasons = Column(JSON, nullable=True)
    ai_match_cache_key = Column(String(80), nullable=True, index=True)
    ai_match_updated_at = Column(DateTime, nullable=True)
    special_interest = Column(Boolean, default=False)
    notes = Column(Text, nullable=True)
    workspace_location = Column(String(255), nullable=True)
    workspace_ats_score = Column(Float, nullable=True)
    workspace_matched_skills = Column(JSON, nullable=True)
    workspace_analysis = Column(JSON, nullable=True)
    workspace_resume_path = Column(String(500), nullable=True)
    delivered_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    user = relationship('User', back_populates='matched_jobs')
    job = relationship('Job', back_populates='matched_jobs')
    application_events = relationship('ApplicationEvent', back_populates='matched_job', cascade='all, delete-orphan')


class ApplicationEvent(Base):
    """Timeline events for a delivered matched job."""
    __tablename__ = 'application_events'

    id = Column(Integer, primary_key=True)
    matched_job_id = Column(Integer, ForeignKey('matched_jobs.id'), nullable=False, index=True)
    event_type = Column(String(50), nullable=False, default='status_changed')
    old_status = Column(String(50), nullable=True)
    new_status = Column(String(50), nullable=True)
    actor = Column(String(50), nullable=False, default='user')
    metadata_json = Column(JSON, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, index=True)

    matched_job = relationship('MatchedJob', back_populates='application_events')


class Resume(Base):
    """Generated resume for a specific job."""
    __tablename__ = 'resumes'

    id = Column(Integer, primary_key=True)
    job_id = Column(Integer, ForeignKey('jobs.id'), nullable=False, index=True)
    pdf_path = Column(String(500), nullable=False)
    version = Column(Integer, default=1)  # Resume version number
    created_at = Column(DateTime, default=datetime.utcnow)

    # Relationship
    job = relationship('Job', back_populates='resumes')


class SearchConfig(Base):
    """Saved search configurations for scraping."""
    __tablename__ = 'search_configs'

    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey('users.id'), nullable=False, index=True)
    name = Column(String(100), nullable=False)
    keywords = Column(JSON, nullable=False)  # List of search keywords
    sources = Column(String(100), nullable=False)  # Comma-separated: linkedin,indeed,glassdoor
    max_jobs = Column(Integer, default=40)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    # Relationship
    user = relationship('User', back_populates='search_configs')


class ScrapeRun(Base):
    """Record of a scraping execution."""
    __tablename__ = 'scrape_runs'

    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey('users.id'), nullable=False, index=True)
    status = Column(String(20), nullable=False)  # pending, running, done, failed
    source = Column(String(20), nullable=False)  # linkedin, indeed, glassdoor
    started_at = Column(DateTime, default=datetime.utcnow)
    finished_at = Column(DateTime, nullable=True)
    jobs_found = Column(Integer, default=0)
    error_msg = Column(Text, nullable=True)
    search_query = Column(String(500), nullable=True)

    # Relationship
    user = relationship('User', back_populates='scrape_runs')
