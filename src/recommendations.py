"""
Recommendation scoring helpers for the current user-facing feed.
"""

from __future__ import annotations

import re
from datetime import datetime, timezone
from typing import Any

from src.onboarding import ROLE_INFERENCE_RULES, infer_industries_from_text


def clamp_score(value: int | float) -> int:
    """Clamp a recommendation score to 0-100."""
    return max(0, min(100, int(round(value))))


SENIORITY_BASE_YEARS = {
    "Entry level": 1,
    "Mid level": 3,
    "Senior": 6,
}

STOPWORDS = {
    "about",
    "across",
    "after",
    "analytics",
    "and",
    "build",
    "building",
    "candidate",
    "cloud",
    "company",
    "data",
    "developer",
    "engineering",
    "experience",
    "for",
    "from",
    "have",
    "hiring",
    "into",
    "join",
    "looking",
    "must",
    "our",
    "platform",
    "role",
    "software",
    "team",
    "that",
    "the",
    "this",
    "through",
    "using",
    "with",
    "work",
    "years",
}


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


def _normalize_text(*parts: str) -> str:
    return " ".join((part or "").strip() for part in parts if part).lower()


def _tokenize(text: str) -> set[str]:
    tokens = set(re.findall(r"[a-z0-9][a-z0-9+#./-]{1,}", (text or "").lower()))
    return {token for token in tokens if token not in STOPWORDS and len(token) > 2}


def _extract_year_hints(text: str) -> list[int]:
    matches = []
    patterns = [
        r"(\d+)\s*-\s*(\d+)\+?\s+years",
        r"(\d+)\+?\s+years",
        r"minimum\s+of\s+(\d+)\s+years",
        r"at\s+least\s+(\d+)\s+years",
    ]
    lowered = (text or "").lower()
    for pattern in patterns:
        for match in re.finditer(pattern, lowered):
            groups = [int(value) for value in match.groups() if value]
            matches.extend(groups)
    return matches


def estimate_candidate_years(profile: Any, resume_text: str) -> int:
    """Estimate years of experience from resume text, falling back to seniority."""
    year_hints = _extract_year_hints(resume_text or "")
    if year_hints:
        return max(year_hints)
    return SENIORITY_BASE_YEARS.get(getattr(profile, "seniority", "") or "", 2)


def infer_job_year_band(job: Any) -> tuple[int, int]:
    """Infer a reasonable years-of-experience band for the job."""
    haystack = _normalize_text(
        getattr(job, "title", "") or "",
        getattr(job, "role_type", "") or "",
        getattr(job, "search_query", "") or "",
        getattr(job, "job_description", "") or "",
    )

    explicit_years = _extract_year_hints(haystack)
    if len(explicit_years) >= 2:
        low, high = min(explicit_years[:2]), max(explicit_years[:2])
        return low, max(high, low + 1)
    if explicit_years:
        low = explicit_years[0]
        return low, max(low + 2, low)

    if any(token in haystack for token in ["intern", "internship", "new grad", "graduate"]):
        return 0, 1
    if any(token in haystack for token in ["entry level", "junior", "associate"]):
        return 0, 2
    if any(token in haystack for token in ["staff", "principal", "architect"]):
        return 7, 12
    if any(token in haystack for token in ["senior", "lead", "manager"]):
        return 5, 9
    return 2, 5


def compute_experience_fit(profile: Any, resume_asset: Any, job: Any) -> dict:
    """Score how well the candidate's likely experience matches the role."""
    resume_text = getattr(resume_asset, "original_text", "") or ""
    candidate_years = estimate_candidate_years(profile, resume_text)
    job_min_years, job_max_years = infer_job_year_band(job)

    if job_min_years <= candidate_years <= job_max_years:
        score = 95
        reason = f"Your estimated {candidate_years} years of experience lines up well with this role."
    else:
        gap = min(abs(candidate_years - job_min_years), abs(candidate_years - job_max_years))
        score = clamp_score(92 - (gap * 18))
        if candidate_years < job_min_years:
            reason = f"This role looks slightly more senior than your current experience level."
        else:
            reason = f"This role looks a bit more junior than your current experience level."

    return {
        "experience_fit_score": score,
        "candidate_years": candidate_years,
        "job_year_band": [job_min_years, job_max_years],
        "fit_reasons": [reason] if score >= 55 else [],
    }


def _extract_role_keywords(role_name: str) -> list[str]:
    lowered_role = (role_name or "").lower()
    for label, keywords in ROLE_INFERENCE_RULES:
        if label.lower() == lowered_role:
            return keywords
    return lowered_role.split()


def compute_role_fit(profile: Any, job: Any, base_skill_score: int) -> dict:
    """Score target-role and skill alignment against the job."""
    roles = getattr(profile, "target_roles", []) or []
    haystack = _normalize_text(
        getattr(job, "title", "") or "",
        getattr(job, "search_query", "") or "",
        getattr(job, "job_description", "") or "",
    )

    title_alignment = 0
    for role in roles[:5]:
        lowered_role = role.lower()
        if lowered_role in haystack:
            title_alignment = max(title_alignment, 100)
            continue
        keyword_hits = sum(1 for keyword in _extract_role_keywords(role) if keyword in haystack)
        if keyword_hits:
            title_alignment = max(title_alignment, min(90, 45 + keyword_hits * 15))

    if not title_alignment:
        title_alignment = 55 if "engineer" in haystack or "developer" in haystack else 40

    role_fit_score = clamp_score((base_skill_score * 0.65) + (title_alignment * 0.35))
    reasons = []
    if title_alignment >= 85 and roles:
        reasons.append(f"The title and description align closely with your target role of {roles[0]}.")
    elif role_fit_score >= 70:
        reasons.append("The job responsibilities line up well with the kind of work you are targeting.")

    return {
        "role_fit_score": role_fit_score,
        "fit_reasons": reasons,
    }


def _top_job_keywords(job: Any) -> list[str]:
    job_text = _normalize_text(
        getattr(job, "title", "") or "",
        getattr(job, "search_query", "") or "",
        getattr(job, "job_description", "") or "",
    )
    ordered = []
    seen = set()
    for token in re.findall(r"[a-z0-9][a-z0-9+#./-]{2,}", job_text):
        if token in STOPWORDS or token in seen:
            continue
        seen.add(token)
        ordered.append(token)
        if len(ordered) >= 18:
            break
    return ordered


def compute_resume_match(profile: Any, resume_asset: Any, job: Any) -> dict:
    """Score how much the current resume already supports the job posting."""
    resume_text = _normalize_text(
        getattr(resume_asset, "original_text", "") or "",
        getattr(profile, "candidate_summary", "") or "",
        " ".join(getattr(profile, "parsed_skills", []) or []),
    )
    resume_tokens = _tokenize(resume_text)
    job_keywords = _top_job_keywords(job)
    keyword_hits = [keyword for keyword in job_keywords if keyword in resume_tokens]
    keyword_ratio = len(keyword_hits) / max(len(job_keywords), 1)

    job_skills = [
        *(getattr(job, "matched_skills", []) or []),
        *(getattr(job, "missing_skills", []) or []),
    ]
    normalized_resume_text = resume_text.lower()
    skill_hits = [
        skill for skill in job_skills
        if skill and skill.lower() in normalized_resume_text
    ]
    skill_ratio = len(skill_hits) / max(len(job_skills), 1) if job_skills else keyword_ratio

    resume_match_score = clamp_score((skill_ratio * 60 + keyword_ratio * 40) * 100)
    reasons = []
    if skill_hits:
        reasons.append(f"Your resume already reflects {', '.join(skill_hits[:3])}.")
    elif resume_match_score >= 70:
        reasons.append("Your resume language overlaps well with this job description.")

    return {
        "resume_match_score": resume_match_score,
        "fit_reasons": reasons,
    }


def compute_location_fit(profile: Any, job: Any) -> dict:
    """Score location and work-mode alignment."""
    preferred_locations = [item.lower() for item in (getattr(profile, "preferred_locations", []) or []) if item]
    work_modes = [item.lower() for item in (getattr(profile, "work_modes", []) or []) if item]
    haystack = _normalize_text(getattr(job, "location", "") or "", getattr(job, "job_description", "") or "")

    job_is_remote = "remote" in haystack
    job_is_hybrid = "hybrid" in haystack
    job_is_onsite = any(token in haystack for token in ["on-site", "onsite"]) or (not job_is_remote and not job_is_hybrid)

    score = 75
    reasons = []

    if work_modes:
        if "remote" in work_modes and job_is_remote:
            score = 95
            reasons.append("The work mode matches your remote preference.")
        elif "hybrid" in work_modes and job_is_hybrid:
            score = 92
            reasons.append("The work mode matches your hybrid preference.")
        elif "on-site" in work_modes and job_is_onsite:
            score = 88
            reasons.append("The work mode lines up with your on-site preference.")
        elif "remote" in work_modes and not job_is_remote:
            score = 40
        elif "hybrid" in work_modes and job_is_onsite and "remote" not in work_modes:
            score = 52

    location_text = (getattr(job, "location", "") or "").lower()
    concrete_prefs = [item for item in preferred_locations if item != "remote"]
    if concrete_prefs:
        if any(pref in location_text for pref in concrete_prefs):
            score = min(100, score + 8)
            reasons.append("The location is inside your preferred search area.")
        elif not job_is_remote:
            score = min(score, 55)

    return {
        "location_fit_score": clamp_score(score),
        "fit_reasons": reasons,
    }


def compute_freshness(job: Any) -> dict:
    """Score how fresh and likely still-actionable the job is."""
    job_date = (
        getattr(job, "posting_date", None)
        or getattr(job, "date_added", None)
    )
    if not job_date:
        return {
            "freshness_score": 70,
            "freshness_label": "Freshness unknown",
            "delivery_boost": 0,
            "stale_for_delivery": False,
            "fit_reasons": [],
        }

    if getattr(job_date, "tzinfo", None) is not None:
        age_days = max(0, int((datetime.now(timezone.utc) - job_date).total_seconds() // 86400))
    else:
        age_days = max(0, int((datetime.utcnow() - job_date).total_seconds() // 86400))

    if age_days <= 3:
        return {
            "freshness_score": 98,
            "freshness_label": "Very fresh",
            "delivery_boost": 5,
            "stale_for_delivery": False,
            "fit_reasons": ["This role was posted recently, which improves the odds it is still actionable."],
        }
    if age_days <= 7:
        return {
            "freshness_score": 90,
            "freshness_label": "Fresh this week",
            "delivery_boost": 3,
            "stale_for_delivery": False,
            "fit_reasons": ["This role is still fresh enough to prioritize in your feed."],
        }
    if age_days <= 14:
        return {
            "freshness_score": 75,
            "freshness_label": "Still active",
            "delivery_boost": 0,
            "stale_for_delivery": False,
            "fit_reasons": [],
        }
    if age_days <= 30:
        return {
            "freshness_score": 52,
            "freshness_label": "Aging listing",
            "delivery_boost": -5,
            "stale_for_delivery": False,
            "fit_reasons": ["This job is getting older, so it should be treated as lower-priority."],
        }
    return {
        "freshness_score": 20,
        "freshness_label": "Stale listing",
        "delivery_boost": -12,
        "stale_for_delivery": True,
        "fit_reasons": ["This listing looks stale, so it should not crowd out fresher opportunities."],
    }


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


def build_current_fit_snapshot(job: Any, profile: Any, resume_asset: Any | None = None) -> dict:
    """Build a composite fit snapshot for the current delivered jobs feed."""
    base_skill_score = int(getattr(job, "skill_score", 0) or 0)
    experience_fit = compute_experience_fit(profile, resume_asset, job)
    resume_match = compute_resume_match(profile, resume_asset, job)
    role_fit = compute_role_fit(profile, job, base_skill_score)
    location_fit = compute_location_fit(profile, job)
    freshness = compute_freshness(job)
    affinity = compute_industry_affinity(getattr(profile, "industries", []) or [], job)
    weighted_fit = (
        (experience_fit["experience_fit_score"] * 0.30)
        + (resume_match["resume_match_score"] * 0.30)
        + (role_fit["role_fit_score"] * 0.25)
        + (location_fit["location_fit_score"] * 0.10)
        + (freshness["freshness_score"] * 0.05)
    )
    overall_fit_score = clamp_score(weighted_fit + affinity["industry_boost"] + freshness["delivery_boost"])

    fit_reasons = [
        *experience_fit["fit_reasons"],
        *resume_match["fit_reasons"],
        *role_fit["fit_reasons"],
        *location_fit["fit_reasons"],
        *freshness["fit_reasons"],
        *affinity["fit_reasons"],
    ][:5]

    return {
        "base_skill_score": base_skill_score,
        "overall_fit_score": overall_fit_score,
        "experience_fit_score": experience_fit["experience_fit_score"],
        "resume_match_score": resume_match["resume_match_score"],
        "role_fit_score": role_fit["role_fit_score"],
        "location_fit_score": location_fit["location_fit_score"],
        "freshness_score": freshness["freshness_score"],
        "freshness_label": freshness["freshness_label"],
        "stale_for_delivery": freshness["stale_for_delivery"],
        "candidate_years": experience_fit["candidate_years"],
        "job_year_band": experience_fit["job_year_band"],
        **affinity,
        "fit_reasons": fit_reasons,
    }
