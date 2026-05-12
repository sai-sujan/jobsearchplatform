"""
Opportunity Inbox API.

Phase 1 keeps Gmail read-only connection metadata separate from the classifier
and ships a deterministic local sync so the dashboard can be used immediately.
"""

from datetime import datetime
from typing import Optional
from urllib.parse import urlencode

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import RedirectResponse
from pydantic import BaseModel
import requests
from sqlalchemy import desc, func
from sqlalchemy.orm import Session

from api.deps import get_current_user, get_db, require_csrf
from src.models import EmailAccount, OpportunityThread, User
from src.opportunities import (
    build_draft_reply,
    decrypt_token,
    encrypt_token,
    exchange_gmail_code,
    fetch_gmail_history_message_ids,
    fetch_gmail_mailbox_profile,
    fetch_gmail_message_full,
    fetch_gmail_metadata_by_ids,
    fetch_gmail_opportunity_metadata,
    fetch_gmail_profile,
    prefilter_opportunity_metadata,
    refresh_gmail_access_token,
    upsert_opportunity_thread,
)
from src.settings import settings

router = APIRouter(prefix="/api/opportunities", tags=["opportunities"])


class ThreadStateUpdate(BaseModel):
    is_resolved: Optional[bool] = None
    thread_state: Optional[str] = None
    is_unread: Optional[bool] = None


def serialize_thread(thread: OpportunityThread) -> dict:
    return {
        "id": thread.id,
        "provider": thread.provider,
        "thread_id": thread.thread_id,
        "message_id": thread.message_id,
        "gmail_message_id": thread.gmail_message_id,
        "gmail_thread_id": thread.gmail_thread_id,
        "gmail_history_id": thread.gmail_history_id,
        "sync_status": thread.sync_status,
        "ai_verdict": thread.ai_verdict,
        "ai_status": thread.ai_status,
        "ai_confidence": thread.ai_confidence,
        "last_checked_at": thread.last_checked_at.isoformat() if thread.last_checked_at else None,
        "resolved_at": thread.resolved_at.isoformat() if thread.resolved_at else None,
        "opened_at": thread.opened_at.isoformat() if thread.opened_at else None,
        "gmail_url": thread.gmail_url,
        "sender": thread.sender,
        "sender_domain": thread.sender_domain,
        "subject": thread.subject,
        "snippet": thread.snippet,
        "received_at": thread.received_at.isoformat() if thread.received_at else None,
        "labels": thread.labels or [],
        "category": thread.category,
        "action_bucket": thread.action_bucket,
        "urgency_score": thread.urgency_score,
        "signals": thread.signals or [],
        "deadline_at": thread.deadline_at.isoformat() if thread.deadline_at else None,
        "matched_company": thread.matched_company,
        "thread_state": thread.thread_state,
        "is_unread": bool(thread.is_unread),
        "is_resolved": bool(thread.is_resolved),
        "one_line_summary": thread.one_line_summary,
        "draft_reply": thread.draft_reply,
        "raw_body_retained": bool(thread.raw_body_retained),
    }


def connection_payload(db: Session, user_id: str) -> dict:
    account = (
        db.query(EmailAccount)
        .filter(EmailAccount.user_id == user_id, EmailAccount.provider == "gmail", EmailAccount.is_active == True)
        .order_by(desc(EmailAccount.connected_at))
        .first()
    )
    return {
        "provider": "gmail",
        "connected": bool(account),
        "email_address": account.email_address if account else "",
        "last_sync_at": account.last_sync_at.isoformat() if account and account.last_sync_at else None,
        "scopes": account.scopes if account else settings.GMAIL_READONLY_SCOPES,
        "readonly": True,
        "configured": bool(settings.GMAIL_CLIENT_ID and settings.GMAIL_CLIENT_SECRET),
    }


@router.get("")
def list_opportunities(
    bucket: str = Query("", description="Optional action bucket filter"),
    include_resolved: bool = Query(False),
    limit: int = Query(50, ge=1, le=200),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    query = db.query(OpportunityThread).filter(OpportunityThread.user_id == user.id)
    if bucket:
        query = query.filter(OpportunityThread.action_bucket == bucket)
    if not include_resolved:
        query = query.filter(OpportunityThread.is_resolved == False)
    threads = (
        query.order_by(desc(OpportunityThread.urgency_score), desc(OpportunityThread.received_at))
        .limit(limit)
        .all()
    )
    return {
        "connection": connection_payload(db, user.id),
        "threads": [serialize_thread(thread) for thread in threads],
        "stats": opportunity_stats(db, user.id),
    }


@router.get("/stats")
def opportunity_stats_route(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    return opportunity_stats(db, user.id)


def opportunity_stats(db: Session, user_id: str) -> dict:
    base = db.query(OpportunityThread).filter(
        OpportunityThread.user_id == user_id,
        OpportunityThread.is_resolved == False,
    )
    bucket_counts = {
        bucket: count
        for bucket, count in (
            base.with_entities(OpportunityThread.action_bucket, func.count(OpportunityThread.id))
            .group_by(OpportunityThread.action_bucket)
            .all()
        )
    }
    urgent = base.filter(OpportunityThread.urgency_score >= 60).count()
    unread = base.filter(OpportunityThread.is_unread == True).count()
    return {
        "total_open": base.count(),
        "urgent": urgent,
        "unread": unread,
        "reply_now": bucket_counts.get("Reply now", 0),
        "deadline_soon": bucket_counts.get("Deadline soon", 0),
        "interview_schedule": bucket_counts.get("Interview / schedule", 0),
        "needs_review": bucket_counts.get("Needs review", 0),
        "safe_to_ignore": bucket_counts.get("Safe to ignore", 0),
        "buckets": bucket_counts,
    }


@router.post("/sync", dependencies=[Depends(require_csrf)])
def sync_opportunities(
    mode: str = Query("full", pattern="^(light|full)$"),
    force: bool = Query(False, description="Force a recovery scan instead of Gmail history sync."),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    created_or_updated = []
    account = (
        db.query(EmailAccount)
        .filter(EmailAccount.user_id == user.id, EmailAccount.provider == "gmail", EmailAccount.is_active == True)
        .first()
    )
    if not account or not account.refresh_token_encrypted:
        raise HTTPException(status_code=409, detail="Connect Gmail before syncing the Opportunity Inbox.")

    limit = 25 if mode == "light" else 100
    history_used = False
    fallback_used = False
    current_history_id = ""

    try:
        refresh_token = decrypt_token(account.refresh_token_encrypted)
        token_payload = refresh_gmail_access_token(refresh_token)
        access_token = token_payload.get("access_token", "")
        if not access_token:
            raise HTTPException(status_code=502, detail="Gmail did not return an access token.")
        account.access_token_encrypted = encrypt_token(access_token)
        mailbox_profile = fetch_gmail_mailbox_profile(access_token)
        current_history_id = str(mailbox_profile.get("historyId") or "")

        if account.history_id and account.last_sync_at and not force:
            try:
                message_ids, next_history_id = fetch_gmail_history_message_ids(
                    access_token,
                    account.history_id,
                    max_results=limit,
                )
                metadata_emails = fetch_gmail_metadata_by_ids(access_token, message_ids)
                account.history_id = next_history_id or current_history_id or account.history_id
                history_used = True
            except requests.HTTPError as error:
                if error.response is None or error.response.status_code != 404:
                    raise
                metadata_emails = fetch_gmail_opportunity_metadata(access_token, max_results=limit)
                account.history_id = current_history_id or account.history_id
                fallback_used = True
        else:
            metadata_emails = fetch_gmail_opportunity_metadata(access_token, max_results=limit)
            account.history_id = current_history_id or account.history_id
            fallback_used = True

        account.last_sync_at = datetime.utcnow()
    except requests.RequestException as error:
        raise HTTPException(status_code=502, detail=f"Gmail sync failed: {error}") from error

    scanned = len(metadata_emails)
    new_messages = 0
    cached = 0
    prefilter_ignored = 0
    body_fetched = 0
    ai_triaged = 0

    for email in metadata_emails:
        existing = (
            db.query(OpportunityThread)
            .filter(
                OpportunityThread.user_id == user.id,
                OpportunityThread.provider == (email.get("provider") or "gmail"),
                OpportunityThread.thread_id == (email.get("thread_id") or email.get("message_id")),
            )
            .first()
        )
        existing_message_id = (existing.gmail_message_id or existing.message_id) if existing else ""
        if existing and existing_message_id == email.get("message_id") and existing.ai_status in {
            "completed",
            "failed",
            "not_needed",
        }:
            cached += 1
            existing.last_checked_at = datetime.utcnow()
            created_or_updated.append(existing)
            continue

        new_messages += 1
        should_fetch_body, reason = prefilter_opportunity_metadata(email)
        if not should_fetch_body:
            prefilter_ignored += 1
            email = {**email, "prefilter_ignore": True, "prefilter_reason": reason}
        else:
            try:
                email = fetch_gmail_message_full(access_token, email)
                body_fetched += 1
                ai_triaged += 1
            except requests.RequestException as error:
                email = {
                    **email,
                    "body": email.get("snippet") or "",
                    "body_fetch_failed": True,
                    "prefilter_reason": f"message fetch failed: {error}",
                }
        created_or_updated.append(upsert_opportunity_thread(db, user.id, email))

    db.commit()
    important_count = sum(
        1
        for thread in created_or_updated
        if thread.action_bucket in {"Reply now", "Deadline soon", "Interview / schedule"}
        or (thread.action_bucket == "Needs review" and thread.ai_verdict in {"positive_progress", "needs_review"})
    )
    return {
        "synced": len(created_or_updated),
        "scanned": scanned,
        "new": new_messages,
        "cached": cached,
        "prefilter_ignored": prefilter_ignored,
        "ignored_by_prefilter": prefilter_ignored,
        "body_fetched": body_fetched,
        "full_fetches": body_fetched,
        "ai_triaged": ai_triaged,
        "important": important_count,
        "history_used": history_used,
        "fallback_used": fallback_used,
        "history_id": account.history_id,
        "threads": [serialize_thread(thread) for thread in created_or_updated],
        "stats": opportunity_stats(db, user.id),
        "mode": mode,
        "force": force,
    }


@router.get("/gmail/auth-url")
def gmail_auth_url(user: User = Depends(get_current_user)):
    if not settings.GMAIL_CLIENT_ID:
        return {
            "configured": False,
            "auth_url": "",
            "detail": "Set GMAIL_CLIENT_ID and GMAIL_CLIENT_SECRET to enable Gmail OAuth.",
            "scopes": settings.GMAIL_READONLY_SCOPES,
        }

    params = {
        "client_id": settings.GMAIL_CLIENT_ID,
        "redirect_uri": settings.GMAIL_REDIRECT_URI,
        "response_type": "code",
        "scope": " ".join(settings.GMAIL_READONLY_SCOPES),
        "access_type": "offline",
        "prompt": "consent",
        "include_granted_scopes": "true",
        "state": user.id,
    }
    return {
        "configured": True,
        "auth_url": f"https://accounts.google.com/o/oauth2/v2/auth?{urlencode(params)}",
        "scopes": settings.GMAIL_READONLY_SCOPES,
    }


@router.get("/gmail/callback")
def gmail_callback(
    code: str = Query(""),
    state: str = Query(""),
    db: Session = Depends(get_db),
):
    if not code or not state:
        raise HTTPException(status_code=400, detail="Missing Gmail OAuth code or state")
    if not settings.GMAIL_CLIENT_ID or not settings.GMAIL_CLIENT_SECRET:
        raise HTTPException(status_code=503, detail="Gmail OAuth is not configured")

    try:
        token_payload = exchange_gmail_code(code)
        access_token = token_payload.get("access_token", "")
        refresh_token = token_payload.get("refresh_token", "")
        profile = fetch_gmail_profile(access_token) if access_token else {}
        mailbox_profile = fetch_gmail_mailbox_profile(access_token) if access_token else {}
    except requests.RequestException as error:
        raise HTTPException(status_code=502, detail=f"Gmail OAuth token exchange failed: {error}") from error

    if not refresh_token:
        raise HTTPException(
            status_code=400,
            detail="Google did not return a refresh token. Disconnect/re-consent with prompt=consent.",
        )

    email_address = profile.get("email") or mailbox_profile.get("emailAddress") or "Connected Gmail"

    account = (
        db.query(EmailAccount)
        .filter(EmailAccount.user_id == state, EmailAccount.provider == "gmail", EmailAccount.email_address == email_address)
        .first()
    )
    if not account:
        account = EmailAccount(
            user_id=state,
            provider="gmail",
            email_address=email_address,
            scopes=settings.GMAIL_READONLY_SCOPES,
            is_active=True,
        )
        db.add(account)
    account.access_token_encrypted = encrypt_token(access_token)
    account.refresh_token_encrypted = encrypt_token(refresh_token)
    account.scopes = settings.GMAIL_READONLY_SCOPES
    account.history_id = str(mailbox_profile.get("historyId") or account.history_id or "")
    account.connected_at = datetime.utcnow()
    account.is_active = True
    db.commit()
    return RedirectResponse(url="http://localhost:5173/opportunities")


@router.post("/gmail/disconnect", dependencies=[Depends(require_csrf)])
def disconnect_gmail(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    db.query(EmailAccount).filter(EmailAccount.user_id == user.id, EmailAccount.provider == "gmail").update({"is_active": False})
    db.commit()
    return {"connected": False}


@router.patch("/{thread_id}/state", dependencies=[Depends(require_csrf)])
def update_thread_state(
    thread_id: str,
    payload: ThreadStateUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    thread = db.query(OpportunityThread).filter(
        OpportunityThread.id == thread_id,
        OpportunityThread.user_id == user.id,
    ).first()
    if not thread:
        raise HTTPException(status_code=404, detail="Opportunity thread not found")
    if payload.is_resolved is not None:
        thread.is_resolved = payload.is_resolved
        thread.resolved_at = datetime.utcnow() if payload.is_resolved else None
    if payload.thread_state:
        thread.thread_state = payload.thread_state
    if payload.is_unread is not None:
        thread.is_unread = payload.is_unread
    db.commit()
    db.refresh(thread)
    return serialize_thread(thread)


@router.post("/{thread_id}/opened", dependencies=[Depends(require_csrf)])
def mark_thread_opened(thread_id: str, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    thread = db.query(OpportunityThread).filter(
        OpportunityThread.id == thread_id,
        OpportunityThread.user_id == user.id,
    ).first()
    if not thread:
        raise HTTPException(status_code=404, detail="Opportunity thread not found")
    thread.opened_at = datetime.utcnow()
    thread.is_unread = False
    db.commit()
    db.refresh(thread)
    return serialize_thread(thread)


@router.post("/{thread_id}/draft-reply", dependencies=[Depends(require_csrf)])
def draft_reply(thread_id: str, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    thread = db.query(OpportunityThread).filter(
        OpportunityThread.id == thread_id,
        OpportunityThread.user_id == user.id,
    ).first()
    if not thread:
        raise HTTPException(status_code=404, detail="Opportunity thread not found")
    thread.draft_reply = build_draft_reply(thread, user.full_name or user.username or "Candidate")
    db.commit()
    db.refresh(thread)
    return serialize_thread(thread)
