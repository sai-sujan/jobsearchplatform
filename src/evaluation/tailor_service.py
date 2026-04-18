import json
import random
import os
import hashlib
from pathlib import Path
from typing import Dict, List, Optional
from pydantic import BaseModel

# Try to import settings. Depending on where this is called from, path might vary.
try:
    from src.settings import settings
except ImportError:
    import sys
    sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..')))
    from src.settings import settings

try:
    from groq import Groq
except ImportError:
    pass

class TailorServiceError(Exception):
    pass


def _truncate(text: str, limit: int) -> str:
    text = (text or "").strip()
    return text if len(text) <= limit else f"{text[:limit].rstrip()}..."


def _cache_path(job_description: str, context_signature: str = "") -> Path:
    digest = hashlib.sha1(
        (
            _truncate(job_description, settings.AI_TAILOR_MAX_JOB_CHARS) +
            "|" +
            _truncate(context_signature, 800)
        ).encode("utf-8")
    ).hexdigest()
    settings.ensure_directories()
    return Path(settings.AI_CACHE_DIR) / f"tailor_{digest}.json"


def _compact_tailor_prompt(
    job_description: str,
    *,
    candidate_summary: str = "",
    resume_text: str = "",
    current_location: str = "",
    current_tech_stack: Optional[Dict] = None,
    target_roles: Optional[List[str]] = None,
    seniority: str = "",
) -> str:
    shortened_jd = _truncate(job_description, settings.AI_TAILOR_MAX_JOB_CHARS)
    current_tech_stack = current_tech_stack or {}
    target_roles = target_roles or []
    compact_stack = {
        category: skills[:8]
        for category, skills in current_tech_stack.items()
        if isinstance(skills, list) and skills
    }
    resume_section = f"\nCandidate's resume (use this to write grounded, specific bullet points):\n{_truncate(resume_text, 1500)}" if resume_text.strip() else ""
    return f"""
You are an ATS optimization assistant. Return only valid JSON.

Candidate profile:
- Target roles: {", ".join(target_roles) if target_roles else "Use the role implied by the resume and current workspace"}
- Seniority: {seniority or "Infer from the profile and keep suggestions realistic"}
- Candidate summary: {_truncate(candidate_summary, 400) or "Not provided"}
- Current workspace location: {current_location or "Use the job's location if it helps"}
- Current tech stack: {json.dumps(compact_stack) if compact_stack else "Not provided"}{resume_section}

Job description excerpt:
{shortened_jd}

Return JSON with exactly these keys:
{{
  "ats_score": <integer 55-95>,
  "location": "<job location>",
  "tech_stack": {{
    "Programming Languages": [...],
    "ML Frameworks & Libraries": [...],
    "LLM & NLP Tools": [...],
    "MLOps & Deployment": [...],
    "Cloud & Infrastructure": [...],
    "Databases & AI Infrastructure": [...],
    "Web & DevOps": [...],
    "ML Specializations": [...]
  }},
  "points": [
    "<bullet 1 under 115 chars>",
    "<bullet 2 under 115 chars>",
    "<bullet 3 under 115 chars>",
    "<bullet 4 under 115 chars>",
    "<bullet 5 under 115 chars>"
  ]
}}

Rules:
- Reuse only skills that plausibly align with the candidate profile above.
- Add JD keywords naturally, but keep bullets concise and specific.
- Do not add explanation or markdown fences.
""".strip()

def generate_tailored_resume_data(
    job_description: str,
    *,
    candidate_summary: str = "",
    resume_text: str = "",
    current_location: str = "",
    current_tech_stack: Optional[Dict] = None,
    target_roles: Optional[List[str]] = None,
    seniority: str = "",
) -> dict:
    """
    Given a job description, uses the Groq LLM (with fallback rotation)
    to generate an ATS score, location, tailored tech stack, and points.

    Returns a dictionary matching the required JSON format.
    Raises TailorServiceError if all keys/models fail.
    """
    if not hasattr(settings, 'GROQ_API_KEYS') or not settings.GROQ_API_KEYS:
        raise TailorServiceError("GROQ_API_KEYS not configured in settings")
    context_signature = json.dumps(
        {
            "candidate_summary": _truncate(candidate_summary, 400),
            "resume_text": _truncate(resume_text, 1500),
            "current_location": current_location,
            "current_tech_stack": current_tech_stack or {},
            "target_roles": target_roles or [],
            "seniority": seniority,
        },
        sort_keys=True,
    )
    cache_path = _cache_path(job_description, context_signature=context_signature)
    if cache_path.exists():
        try:
            return json.loads(cache_path.read_text())
        except json.JSONDecodeError:
            pass

    prompt = _compact_tailor_prompt(
        job_description,
        candidate_summary=candidate_summary,
        resume_text=resume_text,
        current_location=current_location,
        current_tech_stack=current_tech_stack,
        target_roles=target_roles,
        seniority=seniority,
    )
    import re

    # Reasoning models (like gpt-oss-120b) don't support response_format=json_object
    REASONING_MODELS = {"openai/gpt-oss-120b", "openai/gpt-oss-20b"}

    def _extract_json_from_text(text):
        """Extract JSON from freeform text that may contain markdown fences or explanation."""
        if not text:
            return None
        # Try direct parse first
        try:
            return json.loads(text)
        except json.JSONDecodeError:
            pass
        # Try extracting from markdown code fence
        match = re.search(r'```(?:json)?\s*(\{.*?\})\s*```', text, re.DOTALL)
        if match:
            try:
                return json.loads(match.group(1))
            except json.JSONDecodeError:
                pass
        # Try finding first { to last }
        start = text.find('{')
        end = text.rfind('}')
        if start != -1 and end != -1 and end > start:
            try:
                return json.loads(text[start:end+1])
            except json.JSONDecodeError:
                pass
        return None

    # Use 120B reasoning model as primary, 70B as reliable fallback
    models_to_try = [settings.GROQ_LIGHT_MODEL, "openai/gpt-oss-120b", settings.GROQ_MODEL]
    last_exception = None
    
    for model_name in models_to_try:
        keys_to_try = list(settings.GROQ_API_KEYS)
        random.shuffle(keys_to_try)
        is_reasoning_model = model_name in REASONING_MODELS
        
        for api_key in keys_to_try:
            try:
                client = Groq(api_key=api_key)
                
                # Build request kwargs
                kwargs = {
                    "messages": [
                        {
                            "role": "system",
                            "content": "You are a precise JSON-only API. Return strictly valid JSON and nothing else. No markdown fences, no explanation text."
                        },
                        {
                            "role": "user",
                            "content": prompt
                        }
                    ],
                    "model": model_name,
                    "temperature": 0.15,
                    "max_tokens": settings.AI_TAILOR_MAX_TOKENS
                }
                
                # Reasoning models don't support response_format
                if not is_reasoning_model:
                    kwargs["response_format"] = {"type": "json_object"}
                
                response = client.chat.completions.create(**kwargs)
                
                # Parse output
                result_text = response.choices[0].message.content
                
                if is_reasoning_model:
                    tailored_data = _extract_json_from_text(result_text)
                    if tailored_data is None:
                        raise ValueError(f"Could not extract valid JSON from reasoning model response")
                else:
                    tailored_data = json.loads(result_text)
                
                # Validate required keys are present
                required_keys = {"ats_score", "location", "tech_stack", "points"}
                if not required_keys.issubset(tailored_data.keys()):
                    missing = required_keys - tailored_data.keys()
                    raise ValueError(f"Missing required keys in response: {missing}")

                try:
                    cache_path.write_text(json.dumps(tailored_data))
                except OSError:
                    pass
                
                print(f"[tailor_service] Success with model {model_name}")
                return tailored_data
                
            except Exception as e:
                print(f"[tailor_service] Error with key {api_key[:8]}... on model {model_name}: {e}")
                last_exception = e
                error_str = str(e).lower()
                if "429" in error_str or "rate limit" in error_str or "401" in error_str or "json" in error_str or "extract" in error_str:
                    print(f"[tailor_service] Rotating to next key/model...")
                    continue
                else:
                    raise TailorServiceError(str(e))
                
    raise TailorServiceError(f"All Groq API keys and fallback models failed. Last error: {str(last_exception)}")
