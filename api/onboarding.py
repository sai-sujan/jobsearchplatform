"""
Onboarding, profile, resume, and search preset endpoints.
"""

from typing import Optional

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from api.deps import get_current_user, get_db, require_csrf
from src.crud import (
    create_resume_asset,
    get_active_resume_asset,
    get_or_create_profile,
    get_search_presets,
    replace_search_presets,
    update_user_profile,
)
from src.models import User
from src.onboarding import (
    build_generated_search_presets,
    build_role_prompt_context,
    extract_skills_from_resume,
    infer_profile_from_resume,
    summarize_candidate,
)

router = APIRouter(prefix="/api", tags=["onboarding"])


class ResumeIntakeRequest(BaseModel):
    resume_text: str = Field(min_length=50)
    filename: Optional[str] = None
    content_type: Optional[str] = None


class OnboardingProfileRequest(BaseModel):
    full_name: Optional[str] = Field(default=None, max_length=120)
    target_roles: list[str] = Field(default_factory=list)
    seniority: Optional[str] = None
    preferred_locations: list[str] = Field(default_factory=list)
    work_modes: list[str] = Field(default_factory=list)
    employment_types: list[str] = Field(default_factory=list)
    industries: list[str] = Field(default_factory=list)
    visa_preferences: dict = Field(default_factory=dict)
    salary_expectations: Optional[str] = None
    candidate_summary: Optional[str] = None
    parsed_skills: list[str] = Field(default_factory=list)
    onboarding_step: str = "welcome"
    automation_connected: bool = False


class CompleteOnboardingRequest(BaseModel):
    onboarding_step: str = "complete"
    automation_connected: bool = False


def _serialize_profile(user: User, profile, resume_asset, presets):
    return {
        "user": {
            "id": user.id,
            "username": user.username,
            "full_name": user.full_name,
        },
        "profile": {
            "target_roles": profile.target_roles or [],
            "seniority": profile.seniority or "",
            "preferred_locations": profile.preferred_locations or [],
            "work_modes": profile.work_modes or [],
            "employment_types": profile.employment_types or [],
            "industries": profile.industries or [],
            "visa_preferences": profile.visa_preferences or {},
            "salary_expectations": profile.salary_expectations or "",
            "candidate_summary": profile.candidate_summary or "",
            "parsed_skills": profile.parsed_skills or [],
            "onboarding_step": profile.onboarding_step,
            "onboarding_completed": profile.onboarding_completed,
            "automation_connected": profile.automation_connected,
            "prompt_context": build_role_prompt_context(
                {
                    "target_roles": profile.target_roles or [],
                    "seniority": profile.seniority or "",
                    "preferred_locations": profile.preferred_locations or [],
                    "work_modes": profile.work_modes or [],
                    "employment_types": profile.employment_types or [],
                    "industries": profile.industries or [],
                    "visa_preferences": profile.visa_preferences or {},
                    "candidate_summary": profile.candidate_summary or "",
                    "parsed_skills": profile.parsed_skills or [],
                }
            ),
        },
        "resume": (
            {
                "id": resume_asset.id,
                "filename": resume_asset.filename,
                "original_text": resume_asset.original_text,
                "parsed_skills": resume_asset.parsed_skills or [],
            }
            if resume_asset
            else None
        ),
        "search_presets": [
            {
                "id": preset.id,
                "label": preset.label,
                "role": preset.role,
                "keywords": preset.keywords or [],
                "locations": preset.locations or [],
                "work_modes": preset.work_modes or [],
                "employment_types": preset.employment_types or [],
                "industries": preset.industries or [],
                "is_default": preset.is_default,
            }
            for preset in presets
        ],
    }


@router.get("/onboarding")
def get_onboarding_state(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Return the current onboarding/profile state for the signed-in user."""
    profile = get_or_create_profile(db, user.id)
    resume_asset = get_active_resume_asset(db, user.id)
    presets = get_search_presets(db, user.id)
    return _serialize_profile(user, profile, resume_asset, presets)


@router.post("/onboarding/resume", dependencies=[Depends(require_csrf)])
def save_resume_intake(
    request: ResumeIntakeRequest,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Save a pasted/uploaded resume and derive parsed skills."""
    parsed_skills = extract_skills_from_resume(request.resume_text)
    inferred_profile = infer_profile_from_resume(request.resume_text, parsed_skills)
    resume_asset = create_resume_asset(
        db,
        user_id=user.id,
        original_text=request.resume_text.strip(),
        parsed_skills=parsed_skills,
        filename=request.filename,
        content_type=request.content_type,
    )
    current_profile = get_or_create_profile(db, user.id)
    profile = update_user_profile(
        db,
        user.id,
        parsed_skills=parsed_skills,
        target_roles=current_profile.target_roles or inferred_profile["target_roles"],
        seniority=current_profile.seniority or inferred_profile["seniority"],
        preferred_locations=current_profile.preferred_locations or inferred_profile["preferred_locations"],
        work_modes=current_profile.work_modes or inferred_profile["work_modes"],
        employment_types=current_profile.employment_types or inferred_profile["employment_types"],
        industries=current_profile.industries or inferred_profile["industries"],
        candidate_summary=current_profile.candidate_summary or inferred_profile["candidate_summary"],
        onboarding_step="resume_review",
    )
    presets = replace_search_presets(
        db,
        user.id,
        build_generated_search_presets(
            {
                "target_roles": profile.target_roles or [],
                "seniority": profile.seniority or "",
                "preferred_locations": profile.preferred_locations or [],
                "work_modes": profile.work_modes or [],
                "employment_types": profile.employment_types or [],
                "industries": profile.industries or [],
            }
        ),
    )
    return _serialize_profile(user, profile, resume_asset, presets)


@router.put("/onboarding/profile", dependencies=[Depends(require_csrf)])
def save_onboarding_profile(
    request: OnboardingProfileRequest,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Save the role-aware onboarding profile and regenerate search presets."""
    if request.full_name is not None:
        user.full_name = request.full_name.strip() or None
        db.commit()
        db.refresh(user)

    summary = request.candidate_summary
    if not summary:
        summary = summarize_candidate("", request.target_roles, request.parsed_skills)

    profile = update_user_profile(
        db,
        user.id,
        target_roles=request.target_roles,
        seniority=request.seniority,
        preferred_locations=request.preferred_locations,
        work_modes=request.work_modes,
        employment_types=request.employment_types,
        industries=request.industries,
        visa_preferences=request.visa_preferences,
        salary_expectations=request.salary_expectations,
        candidate_summary=summary,
        parsed_skills=request.parsed_skills,
        onboarding_step=request.onboarding_step,
        automation_connected=request.automation_connected,
    )
    presets = replace_search_presets(
        db,
        user.id,
        build_generated_search_presets(
            {
                "target_roles": request.target_roles,
                "seniority": request.seniority,
                "preferred_locations": request.preferred_locations,
                "work_modes": request.work_modes,
                "employment_types": request.employment_types,
                "industries": request.industries,
            }
        ),
    )
    resume_asset = get_active_resume_asset(db, user.id)
    return _serialize_profile(user, profile, resume_asset, presets)


@router.post("/onboarding/complete", dependencies=[Depends(require_csrf)])
def complete_onboarding(
    request: CompleteOnboardingRequest,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Mark onboarding complete and persist automation preference."""
    profile = update_user_profile(
        db,
        user.id,
        onboarding_completed=True,
        onboarding_step=request.onboarding_step,
        automation_connected=request.automation_connected,
    )
    resume_asset = get_active_resume_asset(db, user.id)
    presets = get_search_presets(db, user.id)
    return _serialize_profile(user, profile, resume_asset, presets)


@router.get("/profile")
def get_profile(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Return the current signed-in user's profile data."""
    profile = get_or_create_profile(db, user.id)
    resume_asset = get_active_resume_asset(db, user.id)
    presets = get_search_presets(db, user.id)
    return _serialize_profile(user, profile, resume_asset, presets)
