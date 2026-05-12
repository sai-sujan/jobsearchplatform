"""
Deterministic opportunity inbox scoring.

The pipeline intentionally favors rules first: sender/domain, deadlines,
reply language, scheduling terms, unread recency, and company matching. LLMs
can sit on top later for ambiguous summaries and drafts.
"""

import re
import base64
import hashlib
import json
import random
from html import unescape
from datetime import datetime, timedelta
from email.utils import parsedate_to_datetime, parseaddr
from typing import Iterable, Optional

import requests
from cryptography.fernet import Fernet
from groq import Groq

from sqlalchemy.orm import Session

from src.models import Job, MatchedJob, OpportunityThread
from src.settings import settings


CATEGORIES = {
    "interview": "Interview request",
    "recruiter": "Recruiter outreach",
    "assessment": "Assessment / OA",
    "scheduling": "Scheduling",
    "follow_up": "Follow-up needed",
    "offer": "Offer / next step",
    "rejection": "Auto-rejection",
    "noise": "Newsletter / noise",
    "review": "Needs review",
}

RECRUITER_TERMS = ("recruiter", "talent acquisition", "talent team", "hiring team", "university recruiting")
REPLY_TERMS = (
    "please respond",
    "please confirm",
    "let me know",
    "send your availability",
    "share your availability",
    "are you available",
    "please reply",
    "reply with your availability",
)
NO_REPLY_TERMS = ("do not reply", "please do not reply", "not monitored", "no-reply", "noreply")
SCHEDULING_TERMS = ("schedule", "calendar", "calendly", "availability", "interview", "phone screen", "onsite")
DEADLINE_TERMS = ("complete by", "due by", "deadline", "within 48 hours", "expires", "expiration", "by ")
ASSESSMENT_TERMS = ("assessment", "coding challenge", "hackerrank", "codesignal", "online assessment", " oa ")
POSITIVE_TERMS = (
    "you have been selected",
    "shortlisted",
    "selected to move forward",
    "we would like to move forward",
    "invite you",
    "invitation",
    "next step is",
    "next steps are",
    "offer letter",
    "congratulations",
    "final round",
)
REJECTION_TERMS = (
    "unfortunately",
    "regret to inform",
    "not moving forward",
    "decided to move forward with other",
    "chosen to move forward with other",
    "other candidates",
    "no longer under consideration",
    "not selected",
    "unable to proceed",
)
ACKNOWLEDGEMENT_TERMS = (
    "thank you for applying",
    "thank you for your application",
    "thank you for your interest",
    "application has been received",
    "application was successfully submitted",
    "successfully submitted",
    "we received your application",
    "we've received your application",
    "we have received your application",
    "currently reviewing your application",
    "will review your application",
    "if your application",
    "if you are selected",
    "we will reach out",
    "will be in touch if",
)
NOISE_TERMS = (
    "newsletter",
    "digest",
    "webinar",
    "event reminder",
    "job alert",
    "new jobs matching",
    "survey",
    "feedback matters",
    "sale:",
    "coupon",
    "unsubscribe",
    "linkedin profile",
)
AUTH_CODE_TERMS = ("verification code", "confirm your identity", "security code", "one-time code")

GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token"
GOOGLE_USERINFO_URL = "https://www.googleapis.com/oauth2/v2/userinfo"
GMAIL_PROFILE_URL = "https://gmail.googleapis.com/gmail/v1/users/me/profile"
GMAIL_MESSAGES_URL = "https://gmail.googleapis.com/gmail/v1/users/me/messages"
GMAIL_HISTORY_URL = "https://gmail.googleapis.com/gmail/v1/users/me/history"
GMAIL_HIGH_SIGNAL_QUERY = (
    'newer_than:45d {interview schedule availability recruiter assessment "online assessment" '
    'hackerrank codesignal selected shortlisted "next round" offer deadline "coding challenge"}'
)
GMAIL_UNREAD_RECENT_QUERY = "newer_than:14d in:inbox is:unread"
GMAIL_SEARCH_QUERY = GMAIL_HIGH_SIGNAL_QUERY
AI_VISIBLE_VERDICTS = {"action_required", "positive_progress"}


def _fernet() -> Fernet:
    key_source = settings.JWT_SECRET.encode("utf-8")
    key = base64.urlsafe_b64encode(hashlib.sha256(key_source).digest())
    return Fernet(key)


def encrypt_token(token: str) -> str:
    if not token:
        return ""
    return _fernet().encrypt(token.encode("utf-8")).decode("utf-8")


def decrypt_token(token: str) -> str:
    if not token:
        return ""
    return _fernet().decrypt(token.encode("utf-8")).decode("utf-8")


def sender_domain(sender: str) -> str:
    address = parseaddr(sender or "")[1] or sender or ""
    if "@" not in address:
        return ""
    return address.rsplit("@", 1)[-1].lower()


def exchange_gmail_code(code: str) -> dict:
    response = requests.post(
        GOOGLE_TOKEN_URL,
        data={
            "code": code,
            "client_id": settings.GMAIL_CLIENT_ID,
            "client_secret": settings.GMAIL_CLIENT_SECRET,
            "redirect_uri": settings.GMAIL_REDIRECT_URI,
            "grant_type": "authorization_code",
        },
        timeout=20,
    )
    response.raise_for_status()
    return response.json()


def refresh_gmail_access_token(refresh_token: str) -> dict:
    response = requests.post(
        GOOGLE_TOKEN_URL,
        data={
            "client_id": settings.GMAIL_CLIENT_ID,
            "client_secret": settings.GMAIL_CLIENT_SECRET,
            "refresh_token": refresh_token,
            "grant_type": "refresh_token",
        },
        timeout=20,
    )
    response.raise_for_status()
    return response.json()


def fetch_gmail_profile(access_token: str) -> dict:
    response = requests.get(
        GOOGLE_USERINFO_URL,
        headers={"Authorization": f"Bearer {access_token}"},
        timeout=20,
    )
    response.raise_for_status()
    return response.json()


def fetch_gmail_mailbox_profile(access_token: str) -> dict:
    response = requests.get(
        GMAIL_PROFILE_URL,
        headers={"Authorization": f"Bearer {access_token}"},
        timeout=20,
    )
    response.raise_for_status()
    return response.json()


def _header(headers: list[dict], name: str) -> str:
    return next((item.get("value", "") for item in headers if item.get("name", "").lower() == name.lower()), "")


def _parse_gmail_date(value: str, fallback_ms: str = "") -> datetime:
    if value:
        try:
            parsed = parsedate_to_datetime(value)
            return parsed.replace(tzinfo=None)
        except (TypeError, ValueError):
            pass
    if fallback_ms:
        try:
            return datetime.utcfromtimestamp(int(fallback_ms) / 1000)
        except (TypeError, ValueError):
            pass
    return datetime.utcnow()


def _decode_gmail_data(value: str) -> str:
    if not value:
        return ""
    padding = "=" * (-len(value) % 4)
    try:
        return base64.urlsafe_b64decode(f"{value}{padding}").decode("utf-8", errors="replace")
    except (ValueError, TypeError):
        return ""


def _html_to_text(value: str) -> str:
    if not value:
        return ""
    value = re.sub(r"(?is)<(script|style).*?>.*?</\1>", " ", value)
    value = re.sub(r"(?i)<br\s*/?>", "\n", value)
    value = re.sub(r"(?i)</p\s*>", "\n", value)
    value = re.sub(r"(?s)<[^>]+>", " ", value)
    return unescape(value)


def _normalize_body(value: str) -> str:
    value = value.replace("\r", "\n")
    value = re.sub(r"[ \t]+", " ", value)
    value = re.sub(r"\n{3,}", "\n\n", value)
    return value.strip()


def _extract_part_text(part: dict) -> tuple[str, str]:
    mime_type = part.get("mimeType", "")
    body_data = (part.get("body") or {}).get("data", "")
    if mime_type == "text/plain" and body_data:
        return _decode_gmail_data(body_data), ""
    if mime_type == "text/html" and body_data:
        return "", _html_to_text(_decode_gmail_data(body_data))

    plain_chunks = []
    html_chunks = []
    for child in part.get("parts") or []:
        plain, html = _extract_part_text(child)
        if plain:
            plain_chunks.append(plain)
        if html:
            html_chunks.append(html)
    return "\n".join(plain_chunks), "\n".join(html_chunks)


def extract_gmail_body(payload: dict) -> str:
    plain, html = _extract_part_text(payload or {})
    return _normalize_body(plain or html)


def _body_excerpt(body: str, fallback: str, max_chars: int = 900) -> str:
    text = _normalize_body(body or fallback or "")
    if len(text) <= max_chars:
        return text
    return f"{text[:max_chars].rstrip()}..."


def _dedupe_gmail_messages(raw_messages: list[dict]) -> list[dict]:
    messages_by_thread = {}
    for message in raw_messages:
        thread_key = message.get("threadId") or message.get("id")
        if thread_key and thread_key not in messages_by_thread:
            messages_by_thread[thread_key] = message
    return list(messages_by_thread.values())


def _dedupe_emails_by_thread(emails: list[dict]) -> list[dict]:
    emails_by_thread = {}
    for email in emails:
        thread_key = email.get("thread_id") or email.get("message_id")
        if not thread_key:
            continue
        current = emails_by_thread.get(thread_key)
        if not current or (email.get("received_at") or datetime.min) > (current.get("received_at") or datetime.min):
            emails_by_thread[thread_key] = email
    return sorted(emails_by_thread.values(), key=lambda item: item.get("received_at") or datetime.min, reverse=True)


def _gmail_metadata_to_email(detail: dict, fallback_message_id: str = "") -> dict:
    payload_headers = detail.get("payload", {}).get("headers", [])
    labels = detail.get("labelIds") or []
    message_id = detail.get("id") or fallback_message_id
    thread_id = detail.get("threadId") or message_id
    return {
        "provider": "gmail",
        "thread_id": thread_id,
        "message_id": message_id,
        "gmail_thread_id": thread_id,
        "gmail_message_id": message_id,
        "gmail_history_id": detail.get("historyId") or "",
        "gmail_url": f"https://mail.google.com/mail/u/0/#inbox/{thread_id}" if thread_id else "",
        "sender": _header(payload_headers, "From"),
        "subject": _header(payload_headers, "Subject") or "(No subject)",
        "snippet": detail.get("snippet") or "",
        "body": "",
        "received_at": _parse_gmail_date(_header(payload_headers, "Date"), detail.get("internalDate")),
        "labels": labels,
        "is_unread": "UNREAD" in labels,
    }


def fetch_gmail_message_ids_for_query(access_token: str, query: str, max_results: int = 40) -> list[dict]:
    response = requests.get(
        GMAIL_MESSAGES_URL,
        headers={"Authorization": f"Bearer {access_token}"},
        params={"maxResults": max_results, "q": query},
        timeout=20,
    )
    response.raise_for_status()
    return response.json().get("messages", [])


def fetch_gmail_metadata_by_ids(access_token: str, message_ids: Iterable[str]) -> list[dict]:
    headers = {"Authorization": f"Bearer {access_token}"}
    emails = []
    seen_message_ids = set()
    for message_id in message_ids:
        if not message_id or message_id in seen_message_ids:
            continue
        seen_message_ids.add(message_id)
        detail_response = requests.get(
            f"{GMAIL_MESSAGES_URL}/{message_id}",
            headers=headers,
            params={
                "format": "metadata",
                "metadataHeaders": ["Subject", "From", "Date"],
            },
            timeout=20,
        )
        detail_response.raise_for_status()
        emails.append(_gmail_metadata_to_email(detail_response.json(), message_id))
    return _dedupe_emails_by_thread(emails)


def fetch_gmail_history_message_ids(
    access_token: str,
    start_history_id: str,
    max_results: int = 100,
) -> tuple[list[str], str]:
    if not start_history_id:
        return [], ""

    headers = {"Authorization": f"Bearer {access_token}"}
    message_ids = []
    page_token = ""
    latest_history_id = ""

    while len(message_ids) < max_results:
        params = {
            "startHistoryId": start_history_id,
            "historyTypes": "messageAdded",
            "maxResults": min(100, max_results),
        }
        if page_token:
            params["pageToken"] = page_token
        response = requests.get(GMAIL_HISTORY_URL, headers=headers, params=params, timeout=20)
        response.raise_for_status()
        payload = response.json()
        latest_history_id = payload.get("historyId") or latest_history_id
        for history_item in payload.get("history") or []:
            for added in history_item.get("messagesAdded") or []:
                message = added.get("message") or {}
                message_id = message.get("id")
                if message_id and message_id not in message_ids:
                    message_ids.append(message_id)
                    if len(message_ids) >= max_results:
                        break
            if len(message_ids) >= max_results:
                break
        page_token = payload.get("nextPageToken") or ""
        if not page_token or len(message_ids) >= max_results:
            break

    return message_ids, latest_history_id


def fetch_gmail_opportunity_metadata(access_token: str, max_results: int = 40) -> list[dict]:
    high_signal = fetch_gmail_message_ids_for_query(access_token, GMAIL_HIGH_SIGNAL_QUERY, max_results=max_results)
    unread_recent = fetch_gmail_message_ids_for_query(
        access_token,
        GMAIL_UNREAD_RECENT_QUERY,
        max_results=max(10, min(max_results, 30)),
    )
    messages = _dedupe_gmail_messages([*unread_recent, *high_signal])
    return fetch_gmail_metadata_by_ids(access_token, [message.get("id") for message in messages])


def fetch_gmail_message_full(access_token: str, email: dict) -> dict:
    message_id = email.get("message_id")
    if not message_id:
        return email
    response = requests.get(
        f"{GMAIL_MESSAGES_URL}/{message_id}",
        headers={"Authorization": f"Bearer {access_token}"},
        params={"format": "full"},
        timeout=20,
    )
    response.raise_for_status()
    detail = response.json()
    body = extract_gmail_body(detail.get("payload") or {})
    return {
        **email,
        "snippet": _body_excerpt(body, detail.get("snippet") or email.get("snippet") or ""),
        "body": body,
        "labels": detail.get("labelIds") or email.get("labels") or [],
        "is_unread": "UNREAD" in (detail.get("labelIds") or email.get("labels") or []),
        "gmail_thread_id": detail.get("threadId") or email.get("gmail_thread_id") or email.get("thread_id") or "",
        "gmail_message_id": detail.get("id") or email.get("gmail_message_id") or email.get("message_id") or "",
        "gmail_history_id": detail.get("historyId") or email.get("gmail_history_id") or "",
        "gmail_url": email.get("gmail_url")
        or f"https://mail.google.com/mail/u/0/#inbox/{detail.get('threadId') or email.get('thread_id') or ''}",
    }


def fetch_gmail_opportunity_emails(access_token: str, max_results: int = 50) -> list[dict]:
    return [
        fetch_gmail_message_full(access_token, email)
        for email in fetch_gmail_opportunity_metadata(access_token, max_results=max_results)
    ]


def _contains_any(text: str, terms: Iterable[str]) -> bool:
    return any(term in text for term in terms)


def prefilter_opportunity_metadata(email: dict) -> tuple[bool, str]:
    subject = email.get("subject") or ""
    snippet = email.get("snippet") or ""
    sender = email.get("sender") or ""
    labels = email.get("labels") or []
    text = f"{subject}\n{snippet}\n{sender}".lower()
    domain = sender_domain(sender)
    is_unread = bool(email.get("is_unread") or "UNREAD" in labels)
    is_no_reply_sender = _contains_any(text, NO_REPLY_TERMS) or any(
        marker in sender.lower()
        for marker in ("no-reply", "noreply", "donotreply", "do-not-reply", "notification@", "alerts@")
    )
    human_like_sender = bool(parseaddr(sender or "")[1]) and not is_no_reply_sender

    if _contains_any(text, REJECTION_TERMS):
        return False, "auto-rejection"
    if _contains_any(text, NOISE_TERMS):
        return False, "newsletter/survey/marketing"
    if _contains_any(text, AUTH_CODE_TERMS):
        return False, "verification/security code"
    if _contains_any(text, ACKNOWLEDGEMENT_TERMS) and not (
        _contains_any(text, ASSESSMENT_TERMS)
        or _contains_any(text, SCHEDULING_TERMS)
        or _contains_any(text, POSITIVE_TERMS)
        or _contains_any(text, REPLY_TERMS)
        or "quick question" in text
    ):
        return False, "application receipt"

    high_signal = (
        _contains_any(text, ASSESSMENT_TERMS)
        or _contains_any(text, SCHEDULING_TERMS)
        or _contains_any(text, POSITIVE_TERMS)
        or _contains_any(text, REPLY_TERMS)
        or _contains_any(text, DEADLINE_TERMS)
        or "quick question" in text
        or "availability" in text
        or "shortlisted" in text
    )
    if high_signal:
        return True, "high-signal metadata"
    if human_like_sender and "?" in f"{subject} {snippet}":
        return True, "human sender with a question"
    if is_unread and human_like_sender and (
        _contains_any(text, RECRUITER_TERMS)
        or "recruit" in domain
        or "talent" in domain
        or "greenhouse.io" in domain
        or "lever.co" in domain
    ):
        return True, "unread recruiter-like sender"
    return False, "low-signal metadata"


def _extract_json_object(text: str) -> dict:
    text = (text or "").strip()
    text = re.sub(r"^```(?:json)?\s*", "", text)
    text = re.sub(r"\s*```$", "", text)
    start = text.find("{")
    end = text.rfind("}")
    if start != -1 and end > start:
        text = text[start:end + 1]
    return json.loads(text)


def ai_triage_opportunity_email(email: dict) -> Optional[dict]:
    if not settings.GROQ_API_KEYS:
        return None

    subject = email.get("subject") or "(No subject)"
    sender = email.get("sender") or ""
    body = _normalize_body(email.get("body") or email.get("snippet") or "")
    prompt = f"""Sender: {sender}
Subject: {subject}
Email body excerpt:
{body[:4500]}
"""
    system = """You triage job-search emails for a candidate.

Return ONLY JSON with:
{
  "verdict": "action_required" | "positive_progress" | "ignore",
  "confidence": number 0-1,
  "category": "Interview request" | "Recruiter outreach" | "Assessment / OA" | "Scheduling" | "Offer / next step" | "Auto-rejection" | "Newsletter / noise" | "Application receipt",
  "bucket": "Reply now" | "Deadline soon" | "Interview / schedule" | "Needs review" | "Safe to ignore",
  "urgency_score": integer 0-100,
  "summary": short one-line candidate-facing summary,
  "signals": array of 1-4 short strings
}

Strict policy:
- Ignore all plain application receipts: "thank you for applying", "application received/submitted", "we will review", "we will reach out if selected".
- Ignore all auto-rejections, surveys, newsletters, marketing, sales/promos, job alerts, profile tips, and verification codes.
- action_required only if the candidate must reply, schedule, provide availability/info, complete an assessment/OA/form, or meet a real deadline.
- positive_progress only if the candidate was selected, shortlisted, invited to interview, moved to next round, got an offer, or a recruiter personally expresses interest.
- Ignore login/security/verification codes, incomplete saved drafts, and generic application portal tasks unless they are clearly an assessment, interview scheduling, or a direct human recruiter reply.
- Do not infer good news from generic words like "next step" inside a receipt. Be conservative. If unsure, ignore.
"""
    keys = list(settings.GROQ_API_KEYS)
    random.shuffle(keys)
    last_error = None
    for api_key in keys:
        try:
            client = Groq(api_key=api_key)
            response = client.chat.completions.create(
                model=settings.GROQ_LIGHT_MODEL or "llama-3.1-8b-instant",
                messages=[
                    {"role": "system", "content": system},
                    {"role": "user", "content": prompt},
                ],
                temperature=0,
                max_tokens=320,
                response_format={"type": "json_object"},
                timeout=20,
            )
            payload = _extract_json_object(response.choices[0].message.content or "{}")
            verdict = payload.get("verdict", "ignore")
            if verdict not in {"action_required", "positive_progress", "ignore"}:
                payload["verdict"] = "ignore"
            return payload
        except Exception as error:
            last_error = error
            continue
    if last_error:
        return None
    return None


def _extract_deadline(text: str, received_at: datetime) -> Optional[datetime]:
    lowered = text.lower()
    if "within 24 hours" in lowered:
        return received_at + timedelta(hours=24)
    if "within 48 hours" in lowered:
        return received_at + timedelta(hours=48)
    if "within 72 hours" in lowered:
        return received_at + timedelta(hours=72)

    month_match = re.search(
        r"\b(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|"
        r"sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+(\d{1,2})\b",
        lowered,
    )
    if month_match:
        month_lookup = {
            "jan": 1, "january": 1, "feb": 2, "february": 2, "mar": 3, "march": 3,
            "apr": 4, "april": 4, "may": 5, "jun": 6, "june": 6, "jul": 7, "july": 7,
            "aug": 8, "august": 8, "sep": 9, "september": 9, "oct": 10, "october": 10,
            "nov": 11, "november": 11, "dec": 12, "december": 12,
        }
        month = month_lookup[month_match.group(1)]
        day = int(month_match.group(2))
        year = received_at.year
        candidate = datetime(year, month, day, 23, 59, 0)
        if candidate < received_at - timedelta(days=1):
            candidate = datetime(year + 1, month, day, 23, 59, 0)
        return candidate

    return None


def _known_companies(db: Session, user_id: str) -> list[str]:
    rows = (
        db.query(Job.company)
        .join(MatchedJob, MatchedJob.job_id == Job.id)
        .filter(MatchedJob.user_id == user_id)
        .distinct()
        .all()
    )
    return sorted({(row[0] or "").strip() for row in rows if row[0]}, key=len, reverse=True)


def analyze_opportunity_email(db: Session, user_id: str, email: dict) -> dict:
    subject = email.get("subject") or "(No subject)"
    snippet = email.get("snippet") or ""
    body = email.get("body") or ""
    sender = email.get("sender") or ""
    received_at = email.get("received_at") or datetime.utcnow()
    labels = email.get("labels") or []
    text = f"{subject}\n{snippet}\n{body}\n{sender}".lower()
    domain = sender_domain(sender)
    signals = []
    score = 0

    if email.get("prefilter_ignore"):
        reason = email.get("prefilter_reason") or "low-signal metadata"
        return {
            "sender_domain": domain,
            "category": CATEGORIES["noise"],
            "action_bucket": "Safe to ignore",
            "urgency_score": 0,
            "signals": [f"prefilter: {reason}"],
            "deadline_at": None,
            "matched_company": "",
            "thread_state": "waiting_on_company",
            "one_line_summary": "No candidate action detected.",
            "sync_status": "prefilter_ignored",
            "ai_verdict": "ignore",
            "ai_status": "not_needed",
            "ai_confidence": None,
        }

    category = CATEGORIES["review"]
    is_acknowledgement = _contains_any(text, ACKNOWLEDGEMENT_TERMS)
    is_noise = _contains_any(text, NOISE_TERMS)
    is_no_reply = _contains_any(text, NO_REPLY_TERMS)
    is_auth_code = _contains_any(text, AUTH_CODE_TERMS)
    has_positive = _contains_any(text, POSITIVE_TERMS)
    has_assessment = _contains_any(text, ASSESSMENT_TERMS)
    has_scheduling = _contains_any(text, SCHEDULING_TERMS)
    has_reply_request = _contains_any(text, REPLY_TERMS) and not is_no_reply

    if _contains_any(text, REJECTION_TERMS):
        category = CATEGORIES["rejection"]
        signals.append("auto-rejection language")
        score -= 35
    elif is_noise:
        category = CATEGORIES["noise"]
        signals.append("noise/survey/newsletter")
        score -= 35
    elif is_auth_code:
        category = CATEGORIES["noise"]
        signals.append("verification code")
        score -= 25
    elif has_assessment:
        category = CATEGORIES["assessment"]
        signals.append("assessment language")
        score += 45
    elif has_scheduling and not is_acknowledgement:
        category = CATEGORIES["interview"] if "interview" in text else CATEGORIES["scheduling"]
        signals.append("scheduling language")
        score += 40
    elif has_positive:
        category = CATEGORIES["offer"]
        signals.append("positive next-step language")
        score += 42
    elif _contains_any(text, RECRUITER_TERMS) and not is_acknowledgement:
        category = CATEGORIES["recruiter"]
        signals.append("recruiter sender")
        score += 24
    elif is_acknowledgement:
        category = CATEGORIES["noise"]
        signals.append("application acknowledgement")
        score -= 20

    if has_reply_request:
        signals.append("reply requested")
        score += 32

    deadline_at = _extract_deadline(text, received_at)
    if deadline_at:
        hours_left = max((deadline_at - datetime.utcnow()).total_seconds() / 3600, 0)
        signals.append("deadline detected")
        score += 35 if hours_left <= 72 else 18
    elif _contains_any(text, DEADLINE_TERMS):
        signals.append("deadline wording")
        score += 18

    if "UNREAD" in labels or email.get("is_unread"):
        signals.append("unread")
        score += 10

    age_hours = max((datetime.utcnow() - received_at).total_seconds() / 3600, 0)
    if age_hours <= 24:
        signals.append("recent")
        score += 12
    elif age_hours <= 72:
        score += 5

    matched_company = ""
    for company in _known_companies(db, user_id):
        if company.lower() in text or company.lower().replace(" ", "") in domain.replace("-", ""):
            matched_company = company
            signals.append("matches applied company")
            score += 18
            break

    if is_acknowledgement:
        signals.append("application receipt")
        score -= 16

    score = max(0, min(100, score))
    if category == CATEGORIES["rejection"] or category == CATEGORIES["noise"] or is_acknowledgement or is_auth_code:
        bucket = "Safe to ignore"
        thread_state = "waiting_on_company"
        score = min(score, 15)
    elif deadline_at and deadline_at <= datetime.utcnow() + timedelta(days=3):
        bucket = "Deadline soon"
        thread_state = "waiting_on_me"
    elif category in {CATEGORIES["interview"], CATEGORIES["scheduling"], CATEGORIES["assessment"]}:
        bucket = "Interview / schedule" if category != CATEGORIES["assessment"] else "Deadline soon"
        thread_state = "waiting_on_me"
    elif _contains_any(text, REPLY_TERMS):
        bucket = "Reply now"
        thread_state = "waiting_on_me"
    elif score >= 35:
        bucket = "Needs review"
        thread_state = "waiting_on_me"
    else:
        bucket = "Safe to ignore"
        thread_state = "waiting_on_company"

    summary = build_summary(category, bucket, matched_company, deadline_at, subject)
    analysis = {
        "sender_domain": domain,
        "category": category,
        "action_bucket": bucket,
        "urgency_score": score,
        "signals": signals[:8],
        "deadline_at": deadline_at,
        "matched_company": matched_company,
        "thread_state": thread_state,
        "one_line_summary": summary,
        "sync_status": "synced",
        "ai_verdict": None,
        "ai_status": "not_needed",
        "ai_confidence": None,
    }

    if email.get("body_fetch_failed"):
        analysis.update(
            {
                "category": CATEGORIES["review"],
                "action_bucket": "Needs review",
                "urgency_score": max(50, analysis["urgency_score"]),
                "thread_state": "waiting_on_me",
                "one_line_summary": "Candidate-looking email needs review because Gmail body fetch failed.",
                "signals": [*analysis["signals"], "gmail body fetch failed"][:8],
                "sync_status": "needs_review",
                "ai_verdict": "needs_review",
                "ai_status": "failed",
            }
        )
        return analysis

    ai_result = ai_triage_opportunity_email(email)
    if not ai_result:
        if analysis["action_bucket"] == "Safe to ignore":
            analysis.update(
                {
                    "category": CATEGORIES["review"],
                    "action_bucket": "Needs review",
                    "urgency_score": max(50, analysis["urgency_score"]),
                    "thread_state": "waiting_on_me",
                    "one_line_summary": "Candidate-looking email needs review because AI triage failed.",
                }
            )
        analysis["signals"] = [*analysis["signals"], "ai: failed"][:8]
        analysis["sync_status"] = "needs_review"
        analysis["ai_verdict"] = "needs_review"
        analysis["ai_status"] = "failed"
        return analysis

    verdict = ai_result.get("verdict", "ignore")
    confidence = ai_result.get("confidence")
    try:
        confidence = float(confidence) if confidence is not None else None
    except (TypeError, ValueError):
        confidence = None
    ai_signals = [
        f"ai: {verdict}",
        *[signal for signal in (ai_result.get("signals") or []) if isinstance(signal, str)],
    ]
    if verdict == "ignore":
        analysis.update(
            {
                "category": ai_result.get("category") or analysis["category"],
                "action_bucket": "Safe to ignore",
                "urgency_score": min(int(ai_result.get("urgency_score") or 0), 15),
                "thread_state": "waiting_on_company",
                "one_line_summary": ai_result.get("summary") or "No candidate action needed.",
                "signals": ai_signals[:8],
                "sync_status": "ai_ignored",
                "ai_verdict": verdict,
                "ai_status": "completed",
                "ai_confidence": confidence,
            }
        )
        return analysis

    ai_category = ai_result.get("category") or ""
    ai_summary = (ai_result.get("summary") or "").lower()
    ai_blob = f"{subject}\n{sender}\n{snippet}\n{body}\n{ai_summary}".lower()
    is_portal_noise = (
        ai_category == "Application receipt"
        or _contains_any(ai_blob, AUTH_CODE_TERMS)
        or "saved as a draft" in ai_blob
        or "verification code" in ai_blob
        or "security code" in ai_blob
    )
    has_true_candidate_action = (
        _contains_any(ai_blob, REPLY_TERMS)
        or _contains_any(ai_blob, SCHEDULING_TERMS)
        or _contains_any(ai_blob, ASSESSMENT_TERMS)
        or _contains_any(ai_blob, POSITIVE_TERMS)
        or "quick question" in ai_blob
    )
    if is_portal_noise and not has_true_candidate_action:
        analysis.update(
            {
                "category": ai_category or "Application receipt",
                "action_bucket": "Safe to ignore",
                "urgency_score": 10,
                "thread_state": "waiting_on_company",
                "one_line_summary": ai_result.get("summary") or "Portal receipt or verification email.",
                "signals": ["ai: ignore", "portal/auth noise"][:8],
                "sync_status": "ai_ignored",
                "ai_verdict": "ignore",
                "ai_status": "completed",
                "ai_confidence": confidence,
            }
        )
        return analysis

    bucket = ai_result.get("bucket") or analysis["action_bucket"]
    if verdict == "positive_progress" and bucket == "Safe to ignore":
        bucket = "Needs review"
    analysis.update(
        {
            "category": ai_result.get("category") or analysis["category"],
            "action_bucket": bucket,
            "urgency_score": max(55, min(int(ai_result.get("urgency_score") or analysis["urgency_score"]), 100)),
            "thread_state": "waiting_on_me" if verdict == "action_required" else "waiting_on_company",
            "one_line_summary": ai_result.get("summary") or analysis["one_line_summary"],
            "signals": ai_signals[:8],
            "sync_status": "important",
            "ai_verdict": verdict,
            "ai_status": "completed",
            "ai_confidence": confidence,
        }
    )
    return analysis


def build_summary(category: str, bucket: str, company: str, deadline_at: Optional[datetime], subject: str) -> str:
    target = company or "this opportunity"
    if deadline_at:
        return f"{target}: {category.lower()} with a deadline on {deadline_at.strftime('%b')} {deadline_at.day}."
    if bucket == "Reply now":
        return f"{target}: reply requested on {subject[:90]}."
    if bucket == "Interview / schedule":
        return f"{target}: scheduling or interview action is likely needed."
    if bucket == "Safe to ignore":
        return f"{target}: no candidate action detected."
    return f"{target}: review this {category.lower()}."


def upsert_opportunity_thread(db: Session, user_id: str, email: dict) -> OpportunityThread:
    analysis = analyze_opportunity_email(db, user_id, email)
    provider = email.get("provider") or "gmail"
    thread_id = email.get("thread_id") or email.get("message_id") or f"local-{abs(hash(email.get('subject', '')))}"
    thread = (
        db.query(OpportunityThread)
        .filter(
            OpportunityThread.user_id == user_id,
            OpportunityThread.provider == provider,
            OpportunityThread.thread_id == thread_id,
        )
        .first()
    )
    if not thread:
        thread = OpportunityThread(user_id=user_id, provider=provider, thread_id=thread_id)
        db.add(thread)

    for key, value in {
        "message_id": email.get("message_id"),
        "gmail_message_id": email.get("gmail_message_id") or email.get("message_id"),
        "gmail_thread_id": email.get("gmail_thread_id") or thread_id,
        "gmail_history_id": email.get("gmail_history_id") or "",
        "gmail_url": email.get("gmail_url") or f"https://mail.google.com/mail/u/0/#inbox/{thread_id}",
        "last_checked_at": datetime.utcnow(),
        "sender": email.get("sender") or "",
        "subject": email.get("subject") or "(No subject)",
        "snippet": _body_excerpt(email.get("body") or "", email.get("snippet") or ""),
        "received_at": email.get("received_at") or datetime.utcnow(),
        "labels": email.get("labels") or [],
        "is_unread": bool(email.get("is_unread") or "UNREAD" in (email.get("labels") or [])),
        **analysis,
    }.items():
        setattr(thread, key, value)
    return thread


def build_draft_reply(thread: OpportunityThread, user_name: str = "Candidate") -> str:
    if thread.action_bucket == "Interview / schedule":
        return (
            f"Hi,\n\nThanks for reaching out. I am excited to continue with {thread.matched_company or 'the opportunity'}."
            "\n\nI am available this week and would be happy to coordinate a time that works best for the team."
            f"\n\nBest,\n{user_name}"
        )
    if thread.action_bucket == "Deadline soon":
        return (
            "Hi,\n\nThanks for the update. I have received the assessment details and will complete it before the deadline."
            f"\n\nBest,\n{user_name}"
        )
    return (
        "Hi,\n\nThanks for reaching out. I appreciate the update and would be glad to discuss the next steps."
        f"\n\nBest,\n{user_name}"
    )
