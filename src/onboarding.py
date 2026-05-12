"""
Helpers for onboarding, role profile normalization, and generated presets.
"""

from __future__ import annotations

import json
import re
from pathlib import Path

from src.settings import settings
from src.utils.ai_utils import call_groq, AIServiceError

# A template of the detailed candidate profile
EMPTY_FULL_PROFILE = {
    "personal": {
        "full_name": "", "first_name": "", "last_name": "", "preferred_name": "",
        "email": "", "phone": "", "city": "", "province_state": "", "state_abbreviation": "",
        "country": "", "country_code": "", "postal_code": "", "address": "",
        "street_address": "", "apartment": "", "linkedin_url": "", "github_url": "",
        "portfolio_url": "", "website_url": "", "password": ""
    },
    "work_authorization": {
        "legally_authorized_to_work": True, "require_sponsorship": False, "work_permit_type": ""
    },
    "compensation": {
        "salary_expectation": "", "salary_currency": "USD", "salary_range_min": "", "salary_range_max": "",
        "currency_conversion_note": ""
    },
    "experience": {
        "years_of_experience_total": "", "education_level": "", "current_title": "", "target_role": ""
    },
    "skills_boundary": {
        "programming_languages": [], "frameworks": [], "tools": [], "ml_specializations": []
    },
    "resume_facts": {
        "preserved_companies": [], "preserved_projects": [], "preserved_school": "", "real_metrics": []
    },
    "eeo_voluntary": {
        "gender": "", "race_ethnicity": "", "veteran_status": "", "disability_status": ""
    },
    "availability": {
        "earliest_start_date": "Immediately"
    }
}


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
        "full_profile": ai_extract_profile_from_resume(resume_text)
    }


def ai_extract_profile_from_resume(resume_text: str) -> dict:
    """Use AI to extract a detailed master profile from raw resume text."""
    import copy

    system_prompt = (
        "You are a precise data extraction API. "
        "Extract every piece of information from a resume into a JSON object. "
        "Return ONLY valid JSON — no prose, no markdown fences, no commentary. "
        "Leave missing fields as empty string or empty list, never null."
    )

    user_prompt = f"""RESUME:
{resume_text[:7000]}

Extract into this exact JSON shape. Follow the field-level rules below precisely.

FIELD RULES:
personal.full_name         — candidate's full legal name (usually the largest text at the top)
personal.first_name        — first word(s) of full_name before the last name
personal.last_name         — last word of full_name
personal.preferred_name    — nickname if shown, else same as first_name
personal.email             — email address (look for @ symbol in contact section)
personal.phone             — phone number (look for xxx-xxx-xxxx or (xxx) xxx-xxxx patterns)
personal.city              — city from mailing address if present
personal.province_state    — full state name (e.g. Missouri)
personal.state_abbreviation — 2-letter state code (e.g. MO)
personal.postal_code       — ZIP code if present
personal.address           — full address line if present
personal.street_address    — street portion of address
personal.apartment         — apartment/suite number if present
personal.country           — country (default "United States" if US address)
personal.country_code      — 2-letter country code (default "US")
personal.linkedin_url      — full linkedin.com/in/... URL if present
personal.github_url        — full github.com/... URL if present
personal.portfolio_url     — personal website or portfolio URL (not LinkedIn/GitHub)

work_authorization.legally_authorized_to_work — true (leave as true unless sponsorship is mentioned)
work_authorization.require_sponsorship        — true only if "require sponsorship" or visa like OPT/H-1B is mentioned
work_authorization.work_permit_type           — visa type if mentioned (OPT, H-1B, CPT, etc.) else ""

experience.years_of_experience_total — calculate total professional experience years from work history dates, or extract "X years" phrase; return as string
experience.education_level           — highest degree: "Bachelor's Degree", "Master's Degree", "Doctorate / PhD", etc.
experience.current_title             — most recent job title from work history
experience.target_role               — the role this person seems to be targeting based on their background

skills_boundary.programming_languages — list of coding languages (Python, JavaScript, SQL, Java, Go, etc.)
skills_boundary.frameworks            — libraries and frameworks (PyTorch, React, FastAPI, LangChain, etc.)
skills_boundary.tools                 — infrastructure and tools (Docker, Git, AWS, CI/CD, PostgreSQL, etc.)
skills_boundary.ml_specializations    — ML/AI specializations (RAG, LLMs, Computer Vision, NLP, LoRA, etc.)

resume_facts.preserved_companies — ALL company/employer names from work experience (exact names as written)
resume_facts.preserved_school    — university or college name (exact as written)
resume_facts.preserved_projects  — notable project names if listed
resume_facts.real_metrics        — EVERY quantified achievement with a number or % (e.g. "Reduced latency by 50%", "Served 10k users"). Extract ALL of them.

availability.earliest_start_date — "Immediately" unless a future date is mentioned

Return ONLY the JSON. Schema:
{json.dumps(EMPTY_FULL_PROFILE, indent=2)}"""

    try:
        raw_resp = call_groq(system_prompt, user_prompt, max_tokens=2500, temperature=0.05)

        clean_json = re.sub(r"^```json\s*|\s*```$", "", raw_resp, flags=re.MULTILINE).strip()
        # Sometimes the model wraps in an outer object key
        data = json.loads(clean_json)

        # Deep-merge extracted data onto a fresh copy of the empty template
        merged = copy.deepcopy(EMPTY_FULL_PROFILE)
        for key, val in data.items():
            if key in merged and isinstance(val, dict) and isinstance(merged[key], dict):
                merged[key] = {**merged[key], **{k: v for k, v in val.items() if v not in (None, "", [])}}
            elif val not in (None, ""):
                merged[key] = val
        return merged
    except Exception as e:
        print(f"[onboarding] AI profile extraction failed: {e}")
        return copy.deepcopy(EMPTY_FULL_PROFILE)


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
