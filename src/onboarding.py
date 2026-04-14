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


def summarize_candidate(resume_text: str, target_roles: list[str], parsed_skills: list[str]) -> str:
    """Create a compact user-facing summary from onboarding inputs."""
    roles = ", ".join(target_roles[:3]) if target_roles else "new opportunities"
    skill_text = ", ".join(parsed_skills[:8]) if parsed_skills else "their strongest relevant skills"
    return f"Interested in {roles}. Highlight strengths around {skill_text}."


def build_generated_search_presets(profile: dict) -> list[dict]:
    """Generate user-facing search presets from onboarding data."""
    roles = [role.strip() for role in profile.get("target_roles", []) if role and role.strip()]
    locations = [location.strip() for location in profile.get("preferred_locations", []) if location and location.strip()]
    work_modes = [mode.strip() for mode in profile.get("work_modes", []) if mode and mode.strip()]
    employment_types = [item.strip() for item in profile.get("employment_types", []) if item and item.strip()]
    industries = [item.strip() for item in profile.get("industries", []) if item and item.strip()]

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
