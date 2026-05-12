"""
Score Service
-------------
Evaluates a resume against a job description using the new LLM dispatcher.
Feeds rule-based ATS and skill signals as prompt hints for the LLM.
Results are cached by (job_id, resume_hash) via the dispatcher cache.
"""
import asyncio
import hashlib
from typing import Optional

from src.llm.factory import get_dispatcher
from src.llm.types import Task


def _resume_hash(resume_text: str) -> str:
    return hashlib.sha256(resume_text.encode()).hexdigest()[:16]


def score_resume(
    *,
    job_id: str,
    job_description: str,
    resume_text: str,
    company: str = "",
    title: str = "",
    prompt_version: str = "v3",
) -> dict:
    """
    Synchronous wrapper around the async dispatcher for use in sync contexts
    (background scrape tasks, API endpoints).

    Returns dict with keys: ats_score, skill_match_pct, missing_skills,
    recruiter_verdict, one_line_reason
    """
    resume_hash = _resume_hash(resume_text)
    cache_key = f"{job_id}:{resume_hash}:{prompt_version}"

    # Get rule-based hints (fast, free, no API call)
    ats_hint, detected_skills, missing_skills = _get_rule_based_hints(
        resume_text, job_description
    )

    variables = {
        "resume_text": resume_text[:6000],
        "jd_text": job_description[:4000],
        "ats_hint_score": str(ats_hint),
        "detected_skills": str(detected_skills[:15]),
        "missing_skills": str(missing_skills[:8]),
    }

    dispatcher = get_dispatcher()

    try:
        loop = asyncio.get_event_loop()
        if loop.is_running():
            import concurrent.futures
            with concurrent.futures.ThreadPoolExecutor() as pool:
                future = pool.submit(asyncio.run, _run_score(dispatcher, variables, cache_key))
                result = future.result(timeout=30)
        else:
            result = asyncio.run(_run_score(dispatcher, variables, cache_key))
    except Exception as e:
        # Fallback to rule-based score only
        return {
            "ats_score": ats_hint,
            "skill_match_pct": ats_hint,
            "missing_skills": missing_skills[:5],
            "recruiter_verdict": "maybe",
            "one_line_reason": f"LLM unavailable: {str(e)[:60]}",
            "_fallback": True,
        }

    # result is a Pydantic model (ScoringOutput) or dict
    if hasattr(result, "model_dump"):
        return result.model_dump()
    return result


async def score_resume_async(
    *,
    job_id: str,
    job_description: str,
    resume_text: str,
    company: str = "",
    title: str = "",
    prompt_version: str = "v3",
) -> dict:
    """Async version for use in async FastAPI endpoints."""
    resume_hash = _resume_hash(resume_text)
    cache_key = f"{job_id}:{resume_hash}:{prompt_version}"

    ats_hint, detected_skills, missing_skills = _get_rule_based_hints(
        resume_text, job_description
    )

    variables = {
        "resume_text": resume_text[:6000],
        "jd_text": job_description[:4000],
        "ats_hint_score": str(ats_hint),
        "detected_skills": str(detected_skills[:15]),
        "missing_skills": str(missing_skills[:8]),
    }

    dispatcher = get_dispatcher()
    result = await _run_score(dispatcher, variables, cache_key)

    if hasattr(result, "model_dump"):
        return result.model_dump()
    return result


async def _run_score(dispatcher, variables: dict, cache_key: str):
    """Render the scoring prompt and call the dispatcher."""
    from config.prompts._loader import get_registry
    registry = get_registry()
    rendered = registry.render("scoring", variables)
    response = await dispatcher.run(
        Task.SCORE,
        system=rendered.system,
        user=rendered.user,
        cache_key=cache_key,
    )
    return rendered.parse(response.text)


def _get_rule_based_hints(resume_text: str, jd_text: str) -> tuple[int, list, list]:
    """Get fast rule-based signals to feed as hints to the LLM scorer."""
    try:
        from src.evaluation.skill_matcher import SkillMatcher
        matcher = SkillMatcher()
        match_result = matcher.calculate_match(jd_text)
        detected = match_result.get("matched_skills", [])
        missing = match_result.get("missing_skills", [])
        score = match_result.get("score", 50)
        return int(score), detected, missing
    except Exception:
        return 50, [], []
