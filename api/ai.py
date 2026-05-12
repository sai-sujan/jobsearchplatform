"""
AI endpoints: cover letter generation, question answering, and smart form fill.
Uses Groq LLM + profile-aware RAG for context. EEO/work-auth fields bypass LLM entirely.
"""

import json
import re
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from api.deps import get_current_user, get_db, require_csrf
from src.crud import get_active_resume_asset, get_matched_job, get_or_create_profile
from src.evaluation.rag_service import rag_service
from src.models import User
from src.settings import settings
from src.utils.ai_utils import call_groq, AIServiceError

router = APIRouter(prefix="/api/ai", tags=["ai"])


# ── Helpers ───────────────────────────────────────────────────────────────────

def _truncate(text: str, limit: int) -> str:
    text = (text or "").strip()
    return text[:limit] if len(text) > limit else text


# Field classification for deterministic smart-fill (no LLM needed)
_FIELD_PATTERNS = [
    (re.compile(r"gender|sex\b", re.I),                                                  "gender"),
    (re.compile(r"race|ethnic",  re.I),                                                  "race_ethnicity"),
    (re.compile(r"veteran",      re.I),                                                  "veteran_status"),
    (re.compile(r"disab",        re.I),                                                  "disability_status"),
    (re.compile(r"authori[sz](ed|ation).{0,20}work|eligible.{0,20}work", re.I),         "work_auth_authorized"),
    (re.compile(r"sponsor",      re.I),                                                  "work_auth_sponsorship"),
    (re.compile(r"preferred[\s_-]?name|nickname",   re.I),                               "preferred_name"),
    (re.compile(r"full[\s_-]?name|your[\s_-]?name", re.I),                              "full_name"),
    (re.compile(r"first[\s_-]?name|given",          re.I),                              "first_name"),
    (re.compile(r"last[\s_-]?name|surname",         re.I),                              "last_name"),
    (re.compile(r"e?mail",        re.I),                                                 "email"),
    (re.compile(r"phone|mobile|tel", re.I),                                              "phone"),
    (re.compile(r"linkedin",      re.I),                                                 "linkedin"),
    (re.compile(r"github",        re.I),                                                 "github"),
    (re.compile(r"portfolio|website|personal[\s_-]?site", re.I),                         "portfolio"),
    (re.compile(r"street[\s_-]?address|address[\s_-]?line[\s_-]?1|^address1$", re.I),  "street_address"),
    (re.compile(r"\bapt\.?\b|apartment|suite|address[\s_-]?line[\s_-]?2", re.I),        "apartment"),
    (re.compile(r"city|town",     re.I),                                                 "city"),
    (re.compile(r"state|province", re.I),                                                "state"),
    (re.compile(r"zip|postal",    re.I),                                                 "zip"),
    (re.compile(r"country",       re.I),                                                 "country"),
    (re.compile(r"desired[\s_-]?salary|expected[\s_-]?salary|salary[\s_-]?expect|annual[\s_-]?salary|compensation[\s_-]?expect", re.I), "salary_expectation"),
    (re.compile(r"years.{0,12}experience|experience.{0,12}years", re.I),                "years_of_experience"),
    (re.compile(r"highest.{0,10}education|degree[\s_-]?level|education[\s_-]?level", re.I), "education_level"),
    (re.compile(r"current.{0,10}title|most[\s_-]?recent[\s_-]?title", re.I),           "current_title"),
]


def _classify_field(label: str) -> Optional[str]:
    """Return a canonical field kind for a form label, or None if not deterministic."""
    for pattern, kind in _FIELD_PATTERNS:
        if pattern.search(label):
            return kind
    return None


def _resolve_deterministic_value(kind: str, profile, user: "User") -> Optional[str]:
    """Map a field classification to the concrete value from the structured profile."""
    fp = getattr(profile, "full_profile", {}) or {}
    eeo = fp.get("eeo_voluntary", {})
    work_auth = fp.get("work_authorization", {})
    personal = fp.get("personal", {})
    experience = fp.get("experience", {})
    compensation = fp.get("compensation", {})

    mapping = {
        "gender":              eeo.get("gender"),
        "race_ethnicity":      eeo.get("race_ethnicity"),
        "veteran_status":      eeo.get("veteran_status"),
        "disability_status":   eeo.get("disability_status"),
        "work_auth_authorized":  "Yes" if work_auth.get("legally_authorized_to_work") else "No",
        "work_auth_sponsorship": "Yes" if work_auth.get("require_sponsorship") else "No",
        "preferred_name": personal.get("preferred_name") or "",
        "full_name":  user.full_name or personal.get("full_name") or "",
        "first_name": personal.get("first_name") or (user.full_name or "").split(" ")[0],
        "last_name":  personal.get("last_name") or (" ".join((user.full_name or "").split(" ")[1:])),
        "email":      user.username if "@" in (user.username or "") else personal.get("email", ""),
        "phone":      personal.get("phone", ""),
        "linkedin":   personal.get("linkedin_url", ""),
        "github":     personal.get("github_url", ""),
        "portfolio":  personal.get("portfolio_url") or personal.get("website_url", ""),
        "street_address": personal.get("street_address", ""),
        "apartment":  personal.get("apartment", ""),
        "city":       personal.get("city", ""),
        # province_state = full name ("Missouri"); state_abbreviation = short form ("MO")
        "state":      personal.get("province_state") or personal.get("state_abbreviation", ""),
        "zip":        personal.get("postal_code", ""),
        "country":    personal.get("country", "United States"),
        "salary_expectation":  compensation.get("salary_expectation", ""),
        "years_of_experience": experience.get("years_of_experience_total", ""),
        "education_level":     experience.get("education_level", ""),
        "current_title":       experience.get("current_title", ""),
    }
    val = mapping.get(kind)
    return str(val) if val else None


# ── Cover Letter ──────────────────────────────────────────────────────────────

class CoverLetterRequest(BaseModel):
    job_id: Optional[str] = None
    job_title: Optional[str] = None
    company: Optional[str] = None
    job_description: Optional[str] = None
    tone: Optional[str] = "professional"   # professional | casual | enthusiastic
    length: Optional[str] = "medium"       # short | medium | long


LENGTH_GUIDE = {
    "short": "150–180 words",
    "medium": "230–270 words",
    "long": "380–420 words",
}

TONE_GUIDE = {
    "professional": "formal, confident, and results-oriented",
    "casual": "warm, conversational, and approachable",
    "enthusiastic": "energetic, passionate, and highly motivated",
}


@router.post("/cover-letter", dependencies=[Depends(require_csrf)])
async def generate_cover_letter(
    req: CoverLetterRequest,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Generate a tailored cover letter using hybrid RAG context (pinned facts + relevant chunks)."""
    profile = get_or_create_profile(db, user.id)
    resume_asset = get_active_resume_asset(db, user.id)
    resume_text = resume_asset.original_text if resume_asset else ""

    job_title = req.job_title or ""
    company = req.company or ""
    job_description = req.job_description or ""

    if req.job_id and not job_description:
        matched = get_matched_job(db, req.job_id, str(user.id))
        if matched:
            job_title = job_title or matched.job.title
            company = company or matched.job.company
            job_description = _truncate(matched.job.job_description or "", 3000)

    if not resume_text and not profile.candidate_summary:
        raise HTTPException(status_code=400, detail="No resume found. Please upload one in your profile.")

    if not job_title and not company and not job_description:
        raise HTTPException(status_code=400, detail="Provide at least a job title, company, or job description.")

    name = user.full_name or user.username
    tone_desc = TONE_GUIDE.get(req.tone or "professional", TONE_GUIDE["professional"])
    length_desc = LENGTH_GUIDE.get(req.length or "medium", LENGTH_GUIDE["medium"])

    # Build hybrid context: pinned structured facts + RAG-retrieved JD-relevant chunks (~60% token reduction)
    rag_query = f"{job_title} {company} {job_description[:400]}"
    candidate_context = rag_service.build_hybrid_context(
        profile, rag_query, resume_text, top_k=settings.RAG_MAX_CHUNKS_CL
    )

    system = (
        "You are an expert career coach and cover letter writer. "
        "Write compelling, specific cover letters that reference concrete achievements from the candidate's profile. "
        "The PINNED PROFILE FACTS block is authoritative — prioritize it over resume snippets when they differ. "
        "Never use generic filler phrases like 'I am excited to apply'. Be direct and specific."
    )

    user_prompt = f"""Write a cover letter for {name} applying to {job_title} at {company}.

Tone: {tone_desc}
Length: {length_desc} — be precise.

CANDIDATE CONTEXT:
{candidate_context or profile.candidate_summary or "(no profile data — write a strong general letter)"}

JOB DESCRIPTION:
{_truncate(job_description, 1500) or "(not provided)"}

Requirements:
- Address it "Dear Hiring Team," — no date line or address block
- Reference 2–3 specific achievements or skills from the profile that match the role
- End with a clear call to action
- Return only the cover letter text"""

    if settings.USE_NEW_LLM_STACK:
        from src.llm.factory import get_dispatcher
        from src.llm.types import Task
        from config.prompts._loader import get_registry
        LENGTH_WORDS = {"short": "170", "medium": "250", "long": "400"}
        target_length = LENGTH_WORDS.get(req.length or "medium", "250")
        variables = {
            "candidate_profile": _truncate(candidate_context or profile.candidate_summary or "", 2000),
            "jd_text": _truncate(job_description, 1500),
            "company_name": company or "the company",
            "tone": tone_desc,
            "target_length": target_length,
            "hook_examples": f"{job_title} at {company}" if job_title else "Software Engineer",
        }
        try:
            rendered = get_registry().render("cover_letter", variables)
            response = await get_dispatcher().run(Task.COVER_LETTER, system=rendered.system, user=rendered.user)
            text = response.text
        except Exception as e:
            raise HTTPException(status_code=503, detail=f"AI error: {str(e)[:100]}")
    else:
        try:
            text = call_groq(system, user_prompt, max_tokens=700, temperature=0.65)
        except AIServiceError as e:
            raise HTTPException(status_code=503, detail=str(e))

    return {
        "cover_letter": text,
        "job_title": job_title,
        "company": company,
        "tone": req.tone,
        "length": req.length,
        "word_count": len(text.split()),
    }


# ── Question Answering ────────────────────────────────────────────────────────

class AnswerQuestionRequest(BaseModel):
    question: str
    job_id: Optional[str] = None
    job_title: Optional[str] = None
    company: Optional[str] = None
    job_description: Optional[str] = None
    max_words: Optional[int] = 150
    style: Optional[str] = "concise"   # concise | detailed | bullet


STYLE_GUIDE = {
    "concise": "1–3 short, punchy sentences. Get to the point immediately.",
    "detailed": "2–4 sentences with specific examples from the resume.",
    "bullet": "3–4 bullet points, each starting with a strong action verb.",
}


@router.post("/answer-question", dependencies=[Depends(require_csrf)])
async def answer_application_question(
    req: AnswerQuestionRequest,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Answer a job application question using hybrid RAG (pinned facts + question-relevant chunks)."""
    profile = get_or_create_profile(db, user.id)
    resume_asset = get_active_resume_asset(db, user.id)
    resume_text = resume_asset.original_text if resume_asset else ""

    job_title = req.job_title or ""
    company = req.company or ""
    job_description = req.job_description or ""

    if req.job_id and not job_description:
        matched = get_matched_job(db, req.job_id, str(user.id))
        if matched:
            job_title = job_title or matched.job.title
            company = company or matched.job.company
            job_description = _truncate(matched.job.job_description or "", 2000)

    if not req.question.strip():
        raise HTTPException(status_code=400, detail="Question cannot be empty.")

    name = user.full_name or user.username
    style_desc = STYLE_GUIDE.get(req.style or "concise", STYLE_GUIDE["concise"])
    max_w = min(req.max_words or 150, 400)

    # RAG: pinned facts always included; retrieve question-relevant resume chunks
    candidate_context = rag_service.build_hybrid_context(
        profile, req.question, resume_text, top_k=settings.RAG_MAX_CHUNKS_QA
    )

    system = (
        "You are an expert job application coach. "
        "Write authentic, specific answers in the first person on behalf of the candidate. "
        "The PINNED PROFILE FACTS block is authoritative. "
        "Always ground answers in real resume content — never fabricate experiences."
    )

    user_prompt = f"""Write an answer for {name} to the following application question.

QUESTION: {req.question}

ROLE: {job_title or "N/A"} at {company or "N/A"}
{f"JD EXCERPT: {_truncate(job_description, 600)}" if job_description else ""}

CANDIDATE CONTEXT:
{candidate_context or "(no profile — give a strong general answer)"}

Style: {style_desc}
Max length: ~{max_w} words.

Return only the answer text — no preamble."""

    if settings.USE_NEW_LLM_STACK:
        from src.llm.factory import get_dispatcher
        from src.llm.types import Task
        from config.prompts._loader import get_registry
        variables = {
            "question": req.question,
            "retrieved_context": _truncate(candidate_context or "", 1500),
            "pinned_context": _truncate(profile.candidate_summary or "", 500),
            "target_words": str(max_w),
        }
        try:
            rendered = get_registry().render("qa_behavioral", variables)
            response = await get_dispatcher().run(Task.QA_BEHAVIORAL, system=rendered.system, user=rendered.user)
            answer = response.text
        except Exception as e:
            raise HTTPException(status_code=503, detail=f"AI error: {str(e)[:100]}")
    else:
        try:
            answer = call_groq(system, user_prompt, max_tokens=400, temperature=0.55)
        except AIServiceError as e:
            raise HTTPException(status_code=503, detail=str(e))

    return {
        "answer": answer,
        "question": req.question,
        "style": req.style,
        "word_count": len(answer.split()),
    }


# ── Smart Fill ────────────────────────────────────────────────────────────────

class SmartFormField(BaseModel):
    id: str
    label: str
    type: str
    current_value: Optional[str] = ""
    options: Optional[list[str]] = None


class SmartFillRequest(BaseModel):
    fields: list[SmartFormField]
    job_title: Optional[str] = None
    company: Optional[str] = None
    job_description: Optional[str] = None


@router.post("/smart-fill", dependencies=[Depends(require_csrf)])
async def smart_fill_form(
    req: SmartFillRequest,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Map form fields to profile values.
    Deterministic fields (EEO, work auth, personal info) bypass LLM entirely.
    Only open-ended fields go to Groq with hybrid RAG context.
    """
    profile = get_or_create_profile(db, user.id)
    resume_asset = get_active_resume_asset(db, user.id)
    resume_text = resume_asset.original_text if resume_asset else ""

    # Phase 1: Deterministic — resolve from structured full_profile, no LLM
    deterministic: dict[str, str] = {}
    open_fields: list[SmartFormField] = []

    for field in req.fields:
        kind = _classify_field(field.label)
        if kind:
            val = _resolve_deterministic_value(kind, profile, user)
            if val:
                deterministic[field.id] = val
            # If no value in profile, still skip LLM — let autofill.js handle via regex rules
        else:
            open_fields.append(field)

    # Phase 2: LLM — only for open-ended fields not resolved deterministically
    llm_mapping: dict[str, str] = {}
    if open_fields:
        form_query = " ".join(f.label for f in open_fields)
        candidate_context = rag_service.build_hybrid_context(
            profile, form_query, resume_text, top_k=settings.RAG_MAX_CHUNKS
        )

        name = user.full_name or user.username
        fields_str = "\n".join(
            f"- ID: {f.id} | Label: {f.label} | Type: {f.type}"
            + (f" | Options: {', '.join(f.options[:12])}" if f.options else "")
            for f in open_fields
        )

        system = (
            "You are an expert AI application assistant. "
            "Map a candidate's profile to open-ended job application form fields. "
            "Return a JSON object mapping each field 'id' to a 'value'. "
            "For open-ended questions, write persuasive 2–3 sentence answers grounded in the resume. "
            "For radio, checkbox, and select fields, return the closest matching option text exactly. "
            "For fields you cannot determine, omit them. "
            "PINNED PROFILE FACTS are authoritative."
        )

        user_prompt = f"""CANDIDATE: {name}

CANDIDATE CONTEXT:
{candidate_context}

JOB: {req.job_title or "N/A"} at {req.company or "N/A"}
{f"DESCRIPTION: {_truncate(req.job_description or '', 800)}" if req.job_description else ""}

OPEN-ENDED FIELDS TO FILL:
{fields_str}

Return ONLY valid JSON: {{"field_id": "answer", ...}}"""

        if settings.USE_NEW_LLM_STACK:
            from src.llm.factory import get_dispatcher
            from src.llm.types import Task
            from config.prompts._loader import get_registry
            jd_summary = f"{req.job_title or ''} at {req.company or ''}. {_truncate(req.job_description or '', 400)}"
            variables = {
                "unresolved_fields": json.dumps([
                    {"id": f.id, "label": f.label, "type": f.type,
                     "options": f.options or [], "max_len": 500}
                    for f in open_fields
                ]),
                "candidate_profile_json": _truncate(candidate_context or "{}", 2000),
                "jd_summary": jd_summary,
            }
            try:
                rendered = get_registry().render("form_fill", variables)
                response = await get_dispatcher().run(Task.FORM_FILL, system=rendered.system, user=rendered.user)
                fill_result = rendered.parse(response.text)
                if hasattr(fill_result, "fills"):
                    llm_mapping = {k: v for k, v in fill_result.fills.items() if v is not None}
                else:
                    llm_mapping = fill_result.get("fills", {}) if isinstance(fill_result, dict) else {}
            except Exception as e:
                raise HTTPException(status_code=503, detail=f"AI error: {str(e)[:100]}")
        else:
            try:
                raw = call_groq(system, user_prompt, max_tokens=1000, temperature=0.4)
            except AIServiceError as e:
                raise HTTPException(status_code=503, detail=str(e))

            clean = re.sub(r"^```json\s*|\s*```$", "", raw, flags=re.MULTILINE).strip()
            try:
                llm_mapping = json.loads(clean)
            except json.JSONDecodeError:
                match = re.search(r"\{.*\}", clean, re.DOTALL)
                if match:
                    try:
                        llm_mapping = json.loads(match.group(0))
                    except Exception:
                        llm_mapping = {}

    # Merge: deterministic wins on collision
    mapping = {**llm_mapping, **deterministic}
    return {"mapping": mapping}
