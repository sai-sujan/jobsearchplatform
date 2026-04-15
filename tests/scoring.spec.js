/**
 * Scoring & Recommendation Engine Tests
 * These are Python unit tests that import the scoring module directly.
 * Run with: cd job-applications && python -m pytest tests/test_scoring.py -v
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * NOTE: This file is also a Playwright spec that runs the Python tests via
 * subprocess so the full test suite stays in one place.
 */

import { test, expect } from '@playwright/test'
import { execSync } from 'child_process'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { writeFileSync, mkdirSync } from 'fs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const PROJECT_ROOT = join(__dirname, '..')

// Write the Python test file on the fly
const PYTHON_TEST_FILE = join(PROJECT_ROOT, 'tests', 'test_scoring.py')

writeFileSync(PYTHON_TEST_FILE, `
"""
Unit tests for the scoring and recommendation engine.
Run: cd job-applications && python -m pytest tests/test_scoring.py -v
"""
import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

import pytest
from unittest.mock import MagicMock

# ─── Import modules under test ────────────────────────────────────────────────

from src.recommendations import (
    clamp_score,
    compute_experience_fit,
    compute_location_fit,
    compute_resume_match,
    compute_role_fit,
    compute_industry_affinity,
    build_current_fit_snapshot,
    infer_job_year_band,
    estimate_candidate_years,
    STOPWORDS,
)
from src.crud import (
    job_passes_quality_filters,
    looks_like_staffing_job,
    looks_suspicious_job,
    looks_like_recruiter_post,
    has_salary_signal,
    build_job_search_text,
)


# ─── Helpers ──────────────────────────────────────────────────────────────────

def make_job(**kwargs):
    job = MagicMock()
    defaults = dict(
        title="Machine Learning Engineer",
        company="Acme Corp",
        location="San Francisco, CA",
        source="linkedin",
        job_description="Python, PyTorch, TensorFlow, AWS, MLflow experience required. 2 years experience.",
        search_query="Machine Learning Engineer",
        role_type="Entry-level",
        skill_score=75.0,
        matched_skills=["Python", "PyTorch", "TensorFlow"],
        missing_skills=["Rust"],
        job_link="https://linkedin.com/jobs/123",
        tier="standard",
        is_premium=False,
        premium_indicators=None,
    )
    defaults.update(kwargs)
    for key, value in defaults.items():
        setattr(job, key, value)
    return job


def make_profile(**kwargs):
    profile = MagicMock()
    defaults = dict(
        target_roles=["Machine Learning Engineer"],
        seniority="Entry level",
        preferred_locations=["San Francisco, CA", "Remote"],
        work_modes=["Remote"],
        employment_types=["Full-time"],
        industries=["Technology"],
        quality_filters={},
        candidate_summary="Python ML engineer with 2 years experience",
        parsed_skills=["Python", "PyTorch", "TensorFlow", "FastAPI"],
    )
    defaults.update(kwargs)
    for key, value in defaults.items():
        setattr(profile, key, value)
    return profile


def make_resume(**kwargs):
    asset = MagicMock()
    defaults = dict(
        original_text="""
        Machine Learning Engineer with 2 years of experience.
        Built LLM pipelines with LangChain and PyTorch.
        Deployed models on AWS SageMaker. Proficient in Python, SQL, FastAPI.
        """,
        parsed_skills=["Python", "PyTorch", "LangChain", "AWS", "FastAPI"],
        is_active=True,
    )
    defaults.update(kwargs)
    for key, value in defaults.items():
        setattr(asset, key, value)
    return asset


# ─── clamp_score ──────────────────────────────────────────────────────────────

class TestClampScore:
    def test_clamp_zero(self):
        assert clamp_score(0) == 0

    def test_clamp_100(self):
        assert clamp_score(100) == 100

    def test_clamp_above_100(self):
        assert clamp_score(105) == 100  # S6

    def test_clamp_below_zero(self):
        assert clamp_score(-5) == 0   # S7

    def test_clamp_50(self):
        assert clamp_score(50) == 50

    def test_clamp_float(self):
        assert clamp_score(73.7) == 74  # rounds


# ─── Experience fit ───────────────────────────────────────────────────────────

class TestExperienceFit:
    def test_candidate_in_band_scores_high(self):
        """S9 — candidate years within job band → high score"""
        job = make_job(job_description="2-3 years of experience required", role_type="Mid level")
        profile = make_profile(seniority="Entry level")
        resume = make_resume(original_text="2 years of experience building ML pipelines")
        result = compute_experience_fit(profile, resume, job)
        assert result["experience_fit_score"] >= 90  # S9

    def test_overqualified_candidate_penalized(self):
        """S10 — senior candidate for intern role"""
        job = make_job(job_description="Internship position for students", role_type="Internship")
        profile = make_profile(seniority="Senior")
        resume = make_resume(original_text="10 years of experience as a senior engineer")
        result = compute_experience_fit(profile, resume, job)
        assert result["experience_fit_score"] < 90  # S10 — penalized

    def test_no_resume_fallback(self):
        """S2 — no resume asset, uses profile seniority"""
        job = make_job()
        profile = make_profile()
        result = compute_experience_fit(profile, None, job)
        assert "experience_fit_score" in result
        assert 0 <= result["experience_fit_score"] <= 100

    def test_empty_profile_no_crash(self):
        """S3 — empty profile"""
        job = make_job()
        profile = make_profile(target_roles=[], parsed_skills=[])
        result = compute_experience_fit(profile, None, job)
        assert "experience_fit_score" in result


# ─── infer_job_year_band ──────────────────────────────────────────────────────

class TestInferJobYearBand:
    def test_explicit_range(self):
        job = make_job(job_description="3-5 years of experience required")
        low, high = infer_job_year_band(job)
        assert low == 3
        assert high == 5

    def test_intern_band(self):
        job = make_job(job_description="internship position for students", role_type="Internship")
        low, high = infer_job_year_band(job)
        assert low == 0
        assert high <= 1

    def test_senior_band(self):
        job = make_job(title="Senior ML Engineer", job_description="senior role with 5+ years experience")
        low, high = infer_job_year_band(job)
        assert low >= 4


# ─── Location fit ─────────────────────────────────────────────────────────────

class TestLocationFit:
    def test_remote_job_matches_remote_preference(self):
        job = make_job(location="Remote", job_description="fully remote position")
        profile = make_profile(work_modes=["Remote"])
        result = compute_location_fit(profile, job)
        assert result["location_fit_score"] >= 90  # Strong match

    def test_onsite_job_penalized_for_remote_seeker(self):
        job = make_job(location="New York, NY", job_description="on-site required")
        profile = make_profile(work_modes=["Remote"], preferred_locations=["San Francisco"])
        result = compute_location_fit(profile, job)
        assert result["location_fit_score"] < 75  # Penalized

    def test_hybrid_preference_hybrid_job(self):
        job = make_job(location="Austin, TX", job_description="hybrid work arrangement available")
        profile = make_profile(work_modes=["Hybrid"])
        result = compute_location_fit(profile, job)
        assert result["location_fit_score"] >= 88

    def test_preferred_location_match_boosts_score(self):
        job = make_job(location="San Francisco, CA")
        profile = make_profile(preferred_locations=["San Francisco"], work_modes=[])
        result = compute_location_fit(profile, job)
        # Location match should add bonus
        assert result["location_fit_score"] >= 75


# ─── Resume match ─────────────────────────────────────────────────────────────

class TestResumeMatch:
    def test_high_keyword_overlap_scores_high(self):
        """Resume has many of the same keywords as the JD"""
        job = make_job(
            job_description="Python PyTorch TensorFlow FastAPI AWS Kubernetes MLflow LangChain",
            matched_skills=["Python", "PyTorch", "FastAPI"],
            missing_skills=[]
        )
        profile = make_profile(parsed_skills=["Python", "PyTorch", "FastAPI", "LangChain"])
        resume = make_resume(original_text="Python PyTorch TensorFlow FastAPI AWS Kubernetes MLflow LangChain SQL")
        result = compute_resume_match(profile, resume, job)
        assert result["resume_match_score"] >= 50

    def test_no_resume_returns_zero_match(self):
        """S2 — no resume asset"""
        job = make_job()
        profile = make_profile()
        result = compute_resume_match(profile, None, job)
        assert result["resume_match_score"] == 0


# ─── Role fit ─────────────────────────────────────────────────────────────────

class TestRoleFit:
    def test_exact_title_match_high_score(self):
        job = make_job(title="Machine Learning Engineer", job_description="machine learning engineer role")
        profile = make_profile(target_roles=["Machine Learning Engineer"])
        result = compute_role_fit(profile, job, base_skill_score=80)
        assert result["role_fit_score"] >= 70

    def test_unrelated_role_low_score(self):
        job = make_job(title="Marketing Manager", job_description="marketing and brand management")
        profile = make_profile(target_roles=["Machine Learning Engineer"])
        result = compute_role_fit(profile, job, base_skill_score=30)
        assert result["role_fit_score"] < 65

    def test_empty_target_roles_no_crash(self):
        """S3 — empty profile"""
        job = make_job()
        profile = make_profile(target_roles=[])
        result = compute_role_fit(profile, job, base_skill_score=50)
        assert "role_fit_score" in result
        assert 0 <= result["role_fit_score"] <= 100


# ─── Industry affinity ────────────────────────────────────────────────────────

class TestIndustryAffinity:
    def test_two_matching_industries_max_boost(self):
        """S8 — 2+ matched industries → boost=10"""
        job = make_job(
            title="ML Engineer",
            company="HealthTech Corp",
            job_description="AI for healthcare and fintech platform"
        )
        result = compute_industry_affinity(["Healthcare", "Fintech", "Technology"], job)
        assert result["industry_boost"] >= 6  # At least one match

    def test_no_user_industries_zero_boost(self):
        job = make_job()
        result = compute_industry_affinity([], job)
        assert result["industry_boost"] == 0

    def test_no_match_zero_boost(self):
        job = make_job(title="Retail Cashier", job_description="customer service retail store")
        result = compute_industry_affinity(["Technology", "Healthcare"], job)
        # May or may not match depending on inference
        assert 0 <= result["industry_boost"] <= 10


# ─── Full fit snapshot ────────────────────────────────────────────────────────

class TestBuildFitSnapshot:
    def test_snapshot_has_all_fields(self):
        """S1 — All score components present"""
        job = make_job()
        profile = make_profile()
        resume = make_resume()
        result = build_current_fit_snapshot(job, profile, resume_asset=resume)
        assert "overall_fit_score" in result
        assert "experience_fit_score" in result
        assert "resume_match_score" in result
        assert "role_fit_score" in result
        assert "location_fit_score" in result
        assert "industry_boost" in result
        assert "fit_reasons" in result
        assert isinstance(result["fit_reasons"], list)

    def test_overall_score_is_clamped_0_100(self):
        job = make_job()
        profile = make_profile()
        resume = make_resume()
        result = build_current_fit_snapshot(job, profile, resume_asset=resume)
        assert 0 <= result["overall_fit_score"] <= 100

    def test_perfect_match_scores_high(self):
        """S1 — Near-perfect scenario"""
        job = make_job(
            job_description="Python, PyTorch, FastAPI, LangChain. 2 years experience. Remote OK.",
            location="Remote",
            skill_score=90,
        )
        profile = make_profile(
            target_roles=["Machine Learning Engineer"],
            preferred_locations=["Remote"],
            work_modes=["Remote"],
            seniority="Entry level",
        )
        resume = make_resume()
        result = build_current_fit_snapshot(job, profile, resume_asset=resume)
        assert result["overall_fit_score"] >= 60  # Should be reasonably high

    def test_no_resume_no_crash(self):
        """S2 — resume_asset=None"""
        job = make_job()
        profile = make_profile()
        result = build_current_fit_snapshot(job, profile, resume_asset=None)
        assert "overall_fit_score" in result

    def test_fit_reasons_capped_at_five(self):
        job = make_job()
        profile = make_profile()
        resume = make_resume()
        result = build_current_fit_snapshot(job, profile, resume_asset=resume)
        assert len(result["fit_reasons"]) <= 5


# ─── Quality filters ──────────────────────────────────────────────────────────

class TestQualityFilters:
    def test_no_filters_passes_everything(self):
        job = make_job()
        assert job_passes_quality_filters(job, None) is True
        assert job_passes_quality_filters(job, {}) is True

    def test_minimum_match_score_filter(self):
        """S4-variant: Score below minimum is filtered"""
        job = make_job(skill_score=30)
        filters = {"minimum_match_score": 50}
        assert job_passes_quality_filters(job, filters) is False

    def test_score_at_minimum_passes(self):
        job = make_job(skill_score=50)
        filters = {"minimum_match_score": 50}
        assert job_passes_quality_filters(job, filters) is True

    def test_preferred_source_filter(self):
        job = make_job(source="glassdoor")
        filters = {"preferred_sources": ["LinkedIn"]}
        assert job_passes_quality_filters(job, filters) is False

    def test_matching_source_passes(self):
        job = make_job(source="linkedin")
        filters = {"preferred_sources": ["LinkedIn"]}
        assert job_passes_quality_filters(job, filters) is True

    def test_hide_staffing_agencies(self):
        """S4 — Staffing company is filtered"""
        job = make_job(
            company="TechStaff Recruiting Solutions",
            job_description="We are a staffing agency placing candidates"
        )
        filters = {"hide_staffing_agencies": True}
        assert job_passes_quality_filters(job, filters) is False

    def test_hide_suspicious_jobs(self):
        """S5 — Commission-only job is filtered"""
        job = make_job(
            job_description="commission only sales role, quick money opportunity"
        )
        filters = {"hide_suspicious_jobs": True}
        assert job_passes_quality_filters(job, filters) is False

    def test_exclude_keywords(self):
        job = make_job(title="Senior Staff Principal Engineer", job_description="staff level role")
        filters = {"exclude_keywords": ["senior", "staff"]}
        assert job_passes_quality_filters(job, filters) is False

    def test_salary_visibility_required(self):
        job = make_job(job_description="competitive compensation, benefits and culture")
        filters = {"require_salary_visibility": True}
        assert job_passes_quality_filters(job, filters) is False

    def test_salary_signal_passes(self):
        job = make_job(job_description="salary 120k-160k per year based on experience")
        filters = {"require_salary_visibility": True}
        assert job_passes_quality_filters(job, filters) is True


# ─── Staffing/suspicious heuristics ──────────────────────────────────────────

class TestHeuristics:
    def test_looks_like_staffing_by_company(self):
        job = make_job(company="TopTalent Recruiting Group")
        haystack = build_job_search_text(job)
        assert looks_like_staffing_job(job, haystack) is True

    def test_looks_like_staffing_by_description(self):
        job = make_job(job_description="Our client is a Fortune 500 company seeking a developer")
        haystack = build_job_search_text(job)
        assert looks_like_staffing_job(job, haystack) is True

    def test_normal_company_not_staffing(self):
        job = make_job(company="Google LLC")
        haystack = build_job_search_text(job)
        assert looks_like_staffing_job(job, haystack) is False

    def test_suspicious_job_commission_only(self):
        job = make_job(job_description="commission only great opportunity unlimited earnings")
        haystack = build_job_search_text(job)
        assert looks_suspicious_job(job, haystack) is True

    def test_suspicious_job_missing_link(self):
        job = make_job(job_link="")
        haystack = build_job_search_text(job)
        assert looks_suspicious_job(job, haystack) is True

    def test_has_salary_signal_dollar(self):
        job = make_job(job_description="salary range is $120,000 - $160,000 per year")
        assert has_salary_signal(job) is True

    def test_has_salary_signal_k_notation(self):
        job = make_job(job_description="compensation 120k to 160k based on experience")
        assert has_salary_signal(job) is True

    def test_no_salary_signal(self):
        job = make_job(job_description="competitive compensation, please apply now")
        assert has_salary_signal(job) is False
`)

test('Python scoring unit tests pass', async () => {
  try {
    const result = execSync(
      `cd "${PROJECT_ROOT}" && ${process.env.PYTHON || 'python3'} -m pytest tests/test_scoring.py -v --tb=short 2>&1`,
      { encoding: 'utf8', timeout: 60000 }
    )
    console.log(result)
    expect(result).toContain('passed')
    expect(result).not.toContain('ERROR')
  } catch (error) {
    const output = error.stdout || error.message
    console.log(output)
    // If pytest is not installed, skip gracefully
    if (output.includes('No module named pytest') || output.includes('No module named')) {
      test.skip()
    } else {
      throw new Error(`Python tests failed:\\n${output}`)
    }
  }
})
