"""
Helpers for onboarding, role profile normalization, and generated presets.
"""

from __future__ import annotations

import re
from pathlib import Path

from src.settings import settings


def _load_common_skills() -> list[str]:
    path = Path(settings.COMMON_SKILLS_FILE)
    if not path.exists():
        return []

    skills = []
    for line in path.read_text(encoding="utf-8").splitlines():
        cleaned = line.strip()
        if cleaned and not cleaned.startswith("#"):
            skills.append(cleaned)
    return skills


COMMON_SKILLS = _load_common_skills()


def default_quality_filters() -> dict:
    """Default user-controlled recommendation filters for delivered jobs."""
    return {
        "preferred_sources": ["LinkedIn", "Indeed", "Company Site"],
        "minimum_match_score": 65,
        "include_stretch_roles": True,
        "hide_staffing_agencies": True,
        "hide_suspicious_jobs": True,
        "require_salary_visibility": False,
        "exclude_recruiter_posts": True,
        "exclude_keywords": [],
    }

ROLE_INFERENCE_RULES = [
    ("AI Engineer", ["llm", "langchain", "rag", "generative ai", "agents", "openai", "ollama"]),
    ("Machine Learning Engineer", ["machine learning", "pytorch", "tensorflow", "mlflow", "scikit-learn"]),
    ("Data Scientist", ["data science", "analytics", "forecasting", "statistics", "experimentation"]),
    ("Frontend Engineer", ["react", "typescript", "javascript", "frontend", "css", "ui"]),
    ("Backend Engineer", ["fastapi", "django", "flask", "api", "backend", "microservice"]),
    ("Full Stack Engineer", ["react", "node", "backend", "frontend", "full stack", "postgresql"]),
    ("Product Engineer", ["product", "startup", "customer", "web application", "full stack"]),
]

INDUSTRY_RULES = [
    ("Healthcare", ["healthcare", "clinical", "medical", "biomedical", "patient"]),
    ("Fintech", ["fintech", "payments", "banking", "finance", "trading"]),
    ("Developer Tools", ["developer tools", "platform", "api", "infrastructure", "saas"]),
    ("E-commerce", ["e-commerce", "retail", "marketplace", "shopping"]),
    ("Education", ["education", "learning", "student", "teaching"]),
]


def infer_industries_from_text(text: str, limit: int = 3) -> list[str]:
    """Infer industry labels from arbitrary resume or job text."""
    lowered = (text or "").lower()
    return [
        label
        for label, keywords in INDUSTRY_RULES
        if any(keyword in lowered for keyword in keywords)
    ][:limit]


def extract_skills_from_resume(resume_text: str) -> list[str]:
    """Extract likely skills from resume text using a curated dictionary."""
    haystack = f" {resume_text.lower()} "
    found = []
    for skill in COMMON_SKILLS:
        pattern = skill.lower().strip()
        if not pattern:
            continue
        if re.search(rf"(?<!\w){re.escape(pattern)}(?!\w)", haystack):
            found.append(skill)
    return found[:40]


def infer_profile_from_resume(resume_text: str, parsed_skills: list[str]) -> dict:
    """Infer a role profile from resume text so onboarding feels confirmatory, not manual."""
    lowered = resume_text.lower()
    role_scores = []
    for role, keywords in ROLE_INFERENCE_RULES:
        score = 0
        for keyword in keywords:
            if keyword in lowered:
                score += 2
        for skill in parsed_skills:
            if skill.lower() in lowered and any(token in skill.lower() for token in keywords):
                score += 1
        if score > 0:
            role_scores.append((score, role))

    role_scores.sort(reverse=True)
    inferred_roles = [role for _score, role in role_scores[:3]]
    if not inferred_roles:
        inferred_roles = ["Software Engineer"]

    seniority = "Mid level"
    if any(token in lowered for token in ["intern", "student", "new grad", "graduate"]):
        seniority = "Entry level"
    else:
        years_match = re.search(r"(\d+)\+?\s+years", lowered)
        if years_match:
            years = int(years_match.group(1))
            if years >= 6:
                seniority = "Senior"
            elif years <= 1:
                seniority = "Entry level"
            else:
                seniority = "Mid level"

    work_modes = []
    if "remote" in lowered:
        work_modes.append("Remote")
    if "hybrid" in lowered:
        work_modes.append("Hybrid")
    if "on-site" in lowered or "onsite" in lowered:
        work_modes.append("On-site")
    if not work_modes:
        work_modes = ["Remote", "Hybrid"]

    employment_types = ["Full-time"]
    if "intern" in lowered or "internship" in lowered:
        employment_types = ["Internship"]
    elif "contract" in lowered:
        employment_types = ["Contract"]

    industries = infer_industries_from_text(lowered, limit=3)

    return {
        "target_roles": inferred_roles,
        "seniority": seniority,
        "preferred_locations": ["Remote"] if "remote" in lowered else [],
        "work_modes": work_modes,
        "employment_types": employment_types,
        "industries": industries,
        "candidate_summary": summarize_candidate(resume_text, inferred_roles, parsed_skills),
    }


def summarize_candidate(resume_text: str, target_roles: list[str], parsed_skills: list[str]) -> str:
    """Create a compact user-facing summary from onboarding inputs."""
    roles = ", ".join(target_roles[:3]) if target_roles else "new opportunities"
    skill_text = ", ".join(parsed_skills[:8]) if parsed_skills else "their strongest relevant skills"
    return f"Interested in {roles}. Highlight strengths around {skill_text}."


def build_generated_search_presets(profile: dict) -> list[dict]:
    """Generate user-facing search presets from onboarding data."""
    roles = [role.strip() for role in profile.get("target_roles", []) if role and role.strip()]
    locations = [l.strip() for l in profile.get("preferred_locations", []) if l and l.strip() and l.strip().lower() != "any"]
    work_modes = [m.strip() for m in profile.get("work_modes", []) if m and m.strip() and m.strip().lower() != "any"]
    employment_types = [i.strip() for i in profile.get("employment_types", []) if i and i.strip() and i.strip().lower() != "any"]
    industries = [i.strip() for i in profile.get("industries", []) if i and i.strip() and i.strip().lower() != "any"]

    presets = []
    for role in roles[:5]:
        keywords = [role]
        seniority = profile.get("seniority")
        if seniority:
            keywords.append(f"{seniority} {role}")
        if work_modes:
            keywords.extend([f"{role} {mode}" for mode in work_modes[:2]])

        presets.append(
            {
                "label": role,
                "role": role,
                "keywords": list(dict.fromkeys(keywords)),
                "locations": locations,
                "work_modes": work_modes,
                "employment_types": employment_types,
                "industries": industries,
            }
        )

    if not presets:
        presets.append(
            {
                "label": "Recommended roles",
                "role": "Recommended roles",
                "keywords": ["recommended role"],
                "locations": locations,
                "work_modes": work_modes,
                "employment_types": employment_types,
                "industries": industries,
            }
        )

    return presets


def build_role_prompt_context(profile: dict) -> dict:
    """Normalize role profile fields for AI services and UI copy."""
    return {
        "target_roles": profile.get("target_roles", []),
        "seniority": profile.get("seniority") or "",
        "preferred_locations": profile.get("preferred_locations", []),
        "work_modes": profile.get("work_modes", []),
        "employment_types": profile.get("employment_types", []),
        "industries": profile.get("industries", []),
        "visa_preferences": profile.get("visa_preferences", {}),
        "candidate_summary": profile.get("candidate_summary") or "",
        "parsed_skills": profile.get("parsed_skills", []),
    }
