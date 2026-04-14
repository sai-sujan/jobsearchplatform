"""
Internal delivery API for ingestion and matching services.
"""

from __future__ import annotations

from datetime import datetime
from typing import Any, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from api.deps import get_db, require_internal_token
from src.crud import get_user_by_username, sync_delivered_jobs_for_user, sync_user_matched_jobs

router = APIRouter(prefix="/internal/v1", tags=["internal"])


class DeliveredJobPayload(BaseModel):
    source: str = "web"
    company: str
    title: str
    job_link: str
    location: str = ""
    posting_date: Optional[datetime] = None
    date_added: Optional[datetime] = None
    job_description: str = ""
    role_type: Optional[str] = None
    search_query: Optional[str] = None
    skill_score: Optional[float] = None
    matched_skills: list[str] = Field(default_factory=list)
    missing_skills: list[str] = Field(default_factory=list)
    tier: Optional[str] = None
    ats_score: Optional[float] = None
    ai_evaluation: Optional[dict[str, Any]] = None
    status: str = "not_applied"
    special_interest: bool = False
    notes: str = ""
    is_premium: bool = False
    premium_indicators: list[str] = Field(default_factory=list)
    is_new: bool = True


class DeliveryRequest(BaseModel):
    username: str
    jobs: list[DeliveredJobPayload]
    replace_existing: bool = False
    preserve_user_state: bool = True


class LegacySyncRequest(BaseModel):
    username: str


@router.post("/jobs/deliver", dependencies=[Depends(require_internal_token)])
def deliver_jobs(request: DeliveryRequest, db: Session = Depends(get_db)):
    """Upsert delivered jobs for one user from the internal matching pipeline."""
    user = get_user_by_username(db, request.username.strip().lower())
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    matched_rows = sync_delivered_jobs_for_user(
        db,
        user.id,
        [job.model_dump() for job in request.jobs],
        replace_existing=request.replace_existing,
        preserve_user_state=request.preserve_user_state,
    )

    return {
        "username": user.username,
        "delivered": len(matched_rows),
        "job_ids": [row.id for row in matched_rows],
        "replace_existing": request.replace_existing,
        "preserve_user_state": request.preserve_user_state,
    }


@router.post("/jobs/rebuild-delivery", dependencies=[Depends(require_internal_token)])
def rebuild_delivery(request: LegacySyncRequest, db: Session = Depends(get_db)):
    """Explicitly rebuild a user's delivered feed from the legacy jobs source."""
    user = get_user_by_username(db, request.username.strip().lower())
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    matched_rows = sync_user_matched_jobs(db, user.id)
    return {
        "username": user.username,
        "rebuilt": len(matched_rows),
        "job_ids": [row.id for row in matched_rows[:50]],
    }
