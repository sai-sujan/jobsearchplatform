"""
Optimized AI match enrichment for single delivered jobs.

This module lives outside the legacy `src.evaluation` package so it can be
used without importing the older evaluation stack.
"""

from __future__ import annotations

import hashlib
import json
from datetime import datetime
from typing import Any

from src.settings import settings

try:
    from groq import Groq
except ImportError:  # pragma: no cover
    Groq = None


class AIMatchError(Exception):
    """Raised when AI match enrichment cannot complete."""


def _truncate(text: str, limit: int) -> str:
    text = (text or "").strip()
    return text if len(text) <= limit else f"{text[:limit].rstrip()}..."


def _compact_skills(skills: list[str] | None, limit: int) -> list[str]:
    return [skill for skill in (skills or []) if skill][:limit]


def build_ai_match_cache_key(profile: Any, resume_asset: Any, matched_job: Any) -> str:
    job = matched_job.job
    payload = {
        "user_id": matched_job.user_id,
        "job_id": matched_job.job_id,
        "roles": getattr(profile, "target_roles", []) or [],
        "seniority": getattr(profile, "seniority", "") or "",
        "industries": getattr(profile, "industries", []) or [],
        "skills": _compact_skills(getattr(profile, "parsed_skills", []) or [], settings.AI_MATCH_MAX_SKILLS),
        "resume": _truncate(getattr(resume_asset, "original_text", "") or "", settings.AI_MATCH_MAX_RESUME_CHARS),
        "title": job.title or "",
        "company": job.company or "",
        "location": job.location or "",
        "description": _truncate(job.job_description or "", settings.AI_MATCH_MAX_JOB_CHARS),
    }
    digest = hashlib.sha1(json.dumps(payload, sort_keys=True).encode("utf-8")).hexdigest()
    return digest


def _build_compact_prompt(profile: Any, resume_asset: Any, matched_job: Any) -> str:
    job = matched_job.job
    roles = ", ".join((getattr(profile, "target_roles", []) or [])[:3]) or "General software roles"
    skills = ", ".join(_compact_skills(getattr(profile, "parsed_skills", []) or [], settings.AI_MATCH_MAX_SKILLS)) or "Not provided"
    industries = ", ".join((getattr(profile, "industries", []) or [])[:3]) or "Generalist"
    summary = getattr(profile, "candidate_summary", "") or ""
    resume_excerpt = _truncate(getattr(resume_asset, "original_text", "") or "", settings.AI_MATCH_MAX_RESUME_CHARS)
    job_description = _truncate(job.job_description or "", settings.AI_MATCH_MAX_JOB_CHARS)

    return f"""
You are an expert recruiting copilot. Evaluate fit for a single job using concise reasoning.

Return ONLY valid JSON with this shape:
{{
  "ai_match_score": <integer 0-100>,
  "confidence": "high" | "medium" | "low",
  "summary": "<one sentence under 180 chars>",
  "reasons": ["<reason 1>", "<reason 2>", "<reason 3>"]
}}

Candidate profile:
- Target roles: {roles}
- Seniority: {getattr(profile, "seniority", "") or "Not provided"}
- Industries: {industries}
- Skills: {skills}
- Summary: {summary or "Not provided"}

Resume excerpt:
{resume_excerpt or "No resume excerpt available"}

Job:
- Title: {job.title or ""}
- Company: {job.company or ""}
- Location: {job.location or ""}
- Source: {job.source or ""}
- Existing fit score: {int(matched_job.fit_score or 0)}
- Industry fit label: {matched_job.industry_fit_label or "None"}

Job description excerpt:
{job_description or "No job description available"}

Instructions:
- Penalize obvious seniority mismatch or missing core role alignment.
- Reward strong skill overlap, same-industry experience, and resume evidence.
- Keep reasons concrete and brief.
- Do not mention missing hidden data or internal system details.
""".strip()


def _extract_json(text: str) -> dict | None:
    if not text:
        return None
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        start = text.find("{")
        end = text.rfind("}")
        if start != -1 and end != -1 and end > start:
            try:
                return json.loads(text[start:end + 1])
            except json.JSONDecodeError:
                return None
    return None


def _get_client() -> Groq:
    if Groq is None:
        raise AIMatchError("Groq client is not installed")
    if not settings.GROQ_API_KEYS:
        raise AIMatchError("GROQ_API_KEYS not configured")
    return Groq(api_key=settings.GROQ_API_KEYS[0])


def maybe_enrich_matched_job_with_ai(db: Any, profile: Any, resume_asset: Any, matched_job: Any, force: bool = False) -> dict:
    cache_key = build_ai_match_cache_key(profile, resume_asset, matched_job)
    cached = (
        not force
        and matched_job.ai_match_cache_key == cache_key
        and matched_job.ai_match_summary
    )
    if cached:
        return {
            "ai_match_score": int(matched_job.ai_match_score or 0),
            "confidence": matched_job.ai_match_confidence or "medium",
            "summary": matched_job.ai_match_summary,
            "reasons": matched_job.ai_match_reasons or [],
            "cached": True,
        }

    if not settings.AI_MATCH_ENABLED or not settings.GROQ_API_KEYS:
        fallback = {
            "ai_match_score": int(matched_job.fit_score or 0),
            "confidence": "low",
            "summary": "AI match enrichment is not configured, so this score is using deterministic fit signals only.",
            "reasons": matched_job.fit_reasons or [],
            "cached": False,
        }
        matched_job.ai_match_score = fallback["ai_match_score"]
        matched_job.ai_match_confidence = fallback["confidence"]
        matched_job.ai_match_summary = fallback["summary"]
        matched_job.ai_match_reasons = fallback["reasons"]
        matched_job.ai_match_cache_key = cache_key
        matched_job.ai_match_updated_at = datetime.utcnow()
        db.commit()
        db.refresh(matched_job)
        return fallback

    prompt = _build_compact_prompt(profile, resume_asset, matched_job)
    client = _get_client()
    model_name = settings.AI_MATCH_MODEL or settings.GROQ_LIGHT_MODEL or settings.GROQ_MODEL
    response = client.chat.completions.create(
        model=model_name,
        temperature=0.1,
        max_tokens=settings.AI_MATCH_MAX_TOKENS,
        response_format={"type": "json_object"},
        messages=[
            {"role": "system", "content": "You are a precise recruiting API. Return compact JSON only."},
            {"role": "user", "content": prompt},
        ],
    )
    content = response.choices[0].message.content
    parsed = _extract_json(content)
    if not parsed:
        raise AIMatchError("Could not parse AI match response")

    ai_match_score = int(parsed.get("ai_match_score", matched_job.fit_score or 0))
    confidence = parsed.get("confidence", "medium")
    summary = (parsed.get("summary") or "").strip()[:180]
    reasons = parsed.get("reasons") or []
    if not isinstance(reasons, list):
        reasons = []

    matched_job.ai_match_score = ai_match_score
    matched_job.ai_match_confidence = confidence
    matched_job.ai_match_summary = summary
    matched_job.ai_match_reasons = reasons[:3]
    matched_job.ai_match_cache_key = cache_key
    matched_job.ai_match_updated_at = datetime.utcnow()
    db.commit()
    db.refresh(matched_job)

    return {
        "ai_match_score": ai_match_score,
        "confidence": confidence,
        "summary": summary,
        "reasons": reasons[:3],
        "cached": False,
        "model": model_name,
    }
