"""
Recommendation scoring helpers for the current user-facing feed.
"""

from __future__ import annotations

from typing import Any

from src.onboarding import infer_industries_from_text


def clamp_score(value: int | float) -> int:
    """Clamp a recommendation score to 0-100."""
    return max(0, min(100, int(round(value))))


def normalize_industries(industries: list[str] | None) -> list[str]:
    """Normalize industry names for comparison while preserving user-facing labels."""
    return [industry.strip().lower() for industry in (industries or []) if industry and industry.strip()]


def infer_job_industries(job: Any) -> list[str]:
    """Infer likely industries from job metadata and description."""
    haystack = " ".join(
        [
            getattr(job, "title", "") or "",
            getattr(job, "company", "") or "",
            getattr(job, "location", "") or "",
            getattr(job, "search_query", "") or "",
            getattr(job, "job_description", "") or "",
        ]
    )
    return infer_industries_from_text(haystack, limit=3)


def compute_industry_affinity(profile_industries: list[str] | None, job: Any) -> dict:
    """Compute a sector-affinity boost from the user's background to the job's industry."""
    user_industries = profile_industries or []
    if not user_industries:
        return {
            "job_industries": infer_job_industries(job),
            "matched_industries": [],
            "industry_boost": 0,
            "industry_fit_label": "",
            "fit_reasons": [],
        }

    job_industries = infer_job_industries(job)
    user_lookup = normalize_industries(user_industries)
    matched_industries = [
        industry for industry in job_industries if industry.strip().lower() in user_lookup
    ]

    if len(matched_industries) >= 2:
        return {
            "job_industries": job_industries,
            "matched_industries": matched_industries,
            "industry_boost": 10,
            "industry_fit_label": "Strong sector fit",
            "fit_reasons": [f"Your background aligns well with {', '.join(matched_industries[:2])} roles."],
        }

    if len(matched_industries) == 1:
        return {
            "job_industries": job_industries,
            "matched_industries": matched_industries,
            "industry_boost": 6,
            "industry_fit_label": f"{matched_industries[0]} fit",
            "fit_reasons": [f"This role is in {matched_industries[0]}, which matches your prior sector experience."],
        }

    return {
        "job_industries": job_industries,
        "matched_industries": [],
        "industry_boost": 0,
        "industry_fit_label": "",
        "fit_reasons": [],
    }


def build_current_fit_snapshot(job: Any, profile: Any) -> dict:
    """Build a user-facing fit snapshot for the current legacy jobs feed."""
    base_skill_score = int(getattr(job, "skill_score", 0) or 0)
    affinity = compute_industry_affinity(getattr(profile, "industries", []) or [], job)
    overall_fit_score = clamp_score(base_skill_score + affinity["industry_boost"])
    return {
        "base_skill_score": base_skill_score,
        "overall_fit_score": overall_fit_score,
        **affinity,
    }
