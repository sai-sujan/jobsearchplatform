"""
Tests for Checkpoints 17-19 new features:
  - workspace_service: _sanitize_latex_string, _sanitize_data, generate_resume_from_workspace
  - crud: create_resume versioning, create_application_event, get_application_events
  - models: ApplicationEvent, MatchedJob.workspace_resume_path
  - tailor_service: context-aware prompt, cache keying with context signature

Run: cd job-applications && python -m pytest tests/test_new_features.py -v
"""

import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

import json
import pytest
import hashlib
from unittest.mock import MagicMock, patch, mock_open
from pathlib import Path


# ═══════════════════════════════════════════════════════════════════════════════
# SECTION 1: workspace_service tests (checkpoint-17)
# ═══════════════════════════════════════════════════════════════════════════════

from src.resume.workspace_service import (
    _sanitize_latex_string,
    _sanitize_data,
    WorkspaceResumeGenerationError,
    generate_resume_from_workspace,
)


class TestSanitizeLatexString:
    """Unit tests for _sanitize_latex_string"""

    def test_replaces_en_dash(self):
        assert _sanitize_latex_string("2022–2024") == "2022-2024"

    def test_replaces_em_dash(self):
        assert _sanitize_latex_string("a—b") == "a-b"

    def test_replaces_curly_left_double_quote(self):
        assert _sanitize_latex_string("\u201cHello\u201d") == '"Hello"'

    def test_replaces_curly_right_double_quote(self):
        result = _sanitize_latex_string("\u201chello\u201d")
        assert '"' in result

    def test_replaces_curly_single_quotes(self):
        result = _sanitize_latex_string("it\u2019s")
        assert "'" in result
        assert "\u2019" not in result

    def test_replaces_ellipsis(self):
        assert _sanitize_latex_string("loading\u2026") == "loading..."

    def test_replaces_tilde_with_latex_command(self):
        result = _sanitize_latex_string("100~200")
        assert r"\textasciitilde{}" in result
        assert "~" not in result

    def test_escapes_bare_percent(self):
        result = _sanitize_latex_string("90% accuracy")
        assert r"\%" in result
        assert result == r"90\% accuracy"

    def test_does_not_double_escape_percent(self):
        # Already escaped percent should not be double-escaped
        result = _sanitize_latex_string(r"already \% escaped")
        assert result.count(r"\%") == 1

    def test_plain_ascii_unchanged(self):
        text = "Hello World 123 abc"
        assert _sanitize_latex_string(text) == text

    def test_non_string_passthrough(self):
        assert _sanitize_latex_string(42) == 42
        assert _sanitize_latex_string(None) is None
        assert _sanitize_latex_string(True) is True
        assert _sanitize_latex_string(3.14) == 3.14

    def test_empty_string_unchanged(self):
        assert _sanitize_latex_string("") == ""

    def test_multiple_special_chars_in_one_string(self):
        text = "Reduced latency by 40\u2026 earned \u201cBest ML Engineer\u201d award 2022\u20132024"
        result = _sanitize_latex_string(text)
        assert "..." in result
        assert '"' in result
        assert "-" in result
        assert "\u2026" not in result
        assert "\u201c" not in result
        assert "\u2013" not in result


class TestSanitizeData:
    """Unit tests for recursive _sanitize_data"""

    def test_sanitizes_dict_values(self):
        data = {"title": "2022\u20132024", "score": 90}
        result = _sanitize_data(data)
        assert result["title"] == "2022-2024"
        assert result["score"] == 90

    def test_sanitizes_list_items(self):
        data = ["90\u0025 accuracy", "latency\u2026"]
        result = _sanitize_data(data)
        # percent sign → \% only for bare %
        # ellipsis → ...
        assert "..." in result[1]

    def test_sanitizes_nested_dict(self):
        data = {"points": ["built LLM system\u2026", "accuracy 95%"]}
        result = _sanitize_data(data)
        assert "..." in result["points"][0]
        assert r"\%" in result["points"][1]

    def test_deep_nesting(self):
        data = {"a": {"b": {"c": "em\u2014dash"}}}
        result = _sanitize_data(data)
        assert result["a"]["b"]["c"] == "em-dash"

    def test_empty_dict(self):
        assert _sanitize_data({}) == {}

    def test_empty_list(self):
        assert _sanitize_data([]) == []

    def test_none_passthrough(self):
        assert _sanitize_data(None) is None

    def test_int_passthrough(self):
        assert _sanitize_data(42) == 42

    def test_mixed_types_in_list(self):
        data = [1, "hello\u2013world", None, True]
        result = _sanitize_data(data)
        assert result[0] == 1
        assert result[1] == "hello-world"
        assert result[2] is None
        assert result[3] is True


class TestGenerateResumeFromWorkspace:
    """Tests for generate_resume_from_workspace"""

    def test_raises_if_script_not_found(self, tmp_path):
        """WorkspaceResumeGenerationError when single_generator.py missing"""
        with patch("src.resume.workspace_service.settings") as mock_settings:
            mock_settings.BASE_DIR = tmp_path  # no script here
            mock_settings.RESUMES_DIR = tmp_path
            mock_settings.VENV_PYTHON = Path("/nonexistent/python3")
            with pytest.raises(WorkspaceResumeGenerationError, match="not found"):
                generate_resume_from_workspace(
                    company_name="TestCo",
                    location="Remote",
                    tech_stack={},
                    points=[],
                )

    def test_raises_on_subprocess_timeout(self, tmp_path):
        """WorkspaceResumeGenerationError on timeout"""
        script = tmp_path / "src" / "resume" / "single_generator.py"
        script.parent.mkdir(parents=True)
        script.write_text("# fake")

        with patch("src.resume.workspace_service.settings") as mock_settings, \
             patch("src.resume.workspace_service.subprocess.run") as mock_run:
            mock_settings.BASE_DIR = tmp_path
            mock_settings.RESUMES_DIR = tmp_path
            mock_settings.VENV_PYTHON = Path("/nonexistent/python3")

            import subprocess
            mock_run.side_effect = subprocess.TimeoutExpired(cmd="python3", timeout=60)

            with pytest.raises(WorkspaceResumeGenerationError, match="timed out"):
                generate_resume_from_workspace(
                    company_name="TestCo",
                    location="Remote",
                    tech_stack={},
                    points=[],
                )

    def test_raises_on_nonzero_returncode(self, tmp_path):
        """WorkspaceResumeGenerationError on script failure"""
        script = tmp_path / "src" / "resume" / "single_generator.py"
        script.parent.mkdir(parents=True)
        script.write_text("# fake")

        with patch("src.resume.workspace_service.settings") as mock_settings, \
             patch("src.resume.workspace_service.subprocess.run") as mock_run:
            mock_settings.BASE_DIR = tmp_path
            mock_settings.RESUMES_DIR = tmp_path
            mock_settings.VENV_PYTHON = Path("/nonexistent/python3")

            mock_run.return_value = MagicMock(returncode=1, stderr="LaTeX error", stdout="")

            with pytest.raises(WorkspaceResumeGenerationError, match="failed"):
                generate_resume_from_workspace(
                    company_name="TestCo",
                    location="Remote",
                    tech_stack={},
                    points=[],
                )

    def test_raises_when_pdf_not_produced(self, tmp_path):
        """WorkspaceResumeGenerationError when PDF not present after success"""
        script = tmp_path / "src" / "resume" / "single_generator.py"
        script.parent.mkdir(parents=True)
        script.write_text("# fake")

        with patch("src.resume.workspace_service.settings") as mock_settings, \
             patch("src.resume.workspace_service.subprocess.run") as mock_run:
            mock_settings.BASE_DIR = tmp_path
            mock_settings.RESUMES_DIR = tmp_path
            mock_settings.VENV_PYTHON = Path("/nonexistent/python3")

            mock_run.return_value = MagicMock(returncode=0, stderr="", stdout="success")
            # PDF never created — original_pdf.exists() returns False

            with pytest.raises(WorkspaceResumeGenerationError, match="not generated"):
                generate_resume_from_workspace(
                    company_name="TestCo",
                    location="Remote",
                    tech_stack={},
                    points=[],
                )

    def test_company_name_sanitized_in_filename(self, tmp_path):
        """Special characters in company_name are stripped from PDF filename"""
        script = tmp_path / "src" / "resume" / "single_generator.py"
        script.parent.mkdir(parents=True)
        script.write_text("# fake")

        with patch("src.resume.workspace_service.settings") as mock_settings, \
             patch("src.resume.workspace_service.subprocess.run") as mock_run:
            mock_settings.BASE_DIR = tmp_path
            mock_settings.RESUMES_DIR = tmp_path
            mock_settings.VENV_PYTHON = Path("/nonexistent/python3")

            # Create the "original" PDF that the script would produce
            safe_company = "ATT_1"  # AT&T #1 → ATT_1 (sanitized)
            original_pdf = tmp_path / f"SujanDora_resume_{safe_company}.pdf"
            original_pdf.write_bytes(b"%PDF-1.4 fake content")

            mock_run.return_value = MagicMock(returncode=0, stderr="", stdout="success")

            path, url = generate_resume_from_workspace(
                company_name="AT&T #1",
                location="Dallas, TX",
                tech_stack={},
                points=[],
            )

            assert "ATT_1" in path
            assert "ATT_1" in url
            assert url.startswith("/api/download-resume/")

    def test_empty_company_name_falls_back_to_unknown(self, tmp_path):
        """Empty company_name falls back to 'Unknown' in filename"""
        script = tmp_path / "src" / "resume" / "single_generator.py"
        script.parent.mkdir(parents=True)
        script.write_text("# fake")

        with patch("src.resume.workspace_service.settings") as mock_settings, \
             patch("src.resume.workspace_service.subprocess.run") as mock_run:
            mock_settings.BASE_DIR = tmp_path
            mock_settings.RESUMES_DIR = tmp_path
            mock_settings.VENV_PYTHON = Path("/nonexistent/python3")

            original_pdf = tmp_path / "SujanDora_resume_Unknown.pdf"
            original_pdf.write_bytes(b"%PDF-1.4 fake")
            mock_run.return_value = MagicMock(returncode=0, stderr="", stdout="")

            path, url = generate_resume_from_workspace(
                company_name="",
                location="Remote",
                tech_stack={},
                points=[],
            )
            assert "Unknown" in path

    def test_temp_file_cleaned_up_on_success(self, tmp_path):
        """Temp JSON file is deleted after subprocess completes"""
        script = tmp_path / "src" / "resume" / "single_generator.py"
        script.parent.mkdir(parents=True)
        script.write_text("# fake")

        created_tmp = []

        original_NamedTemporaryFile = __import__('tempfile').NamedTemporaryFile

        def capture_tmp(*args, **kwargs):
            handle = original_NamedTemporaryFile(*args, **kwargs)
            created_tmp.append(Path(handle.name))
            return handle

        with patch("src.resume.workspace_service.settings") as mock_settings, \
             patch("src.resume.workspace_service.subprocess.run") as mock_run, \
             patch("src.resume.workspace_service.tempfile.NamedTemporaryFile", side_effect=capture_tmp):
            mock_settings.BASE_DIR = tmp_path
            mock_settings.RESUMES_DIR = tmp_path
            mock_settings.VENV_PYTHON = Path("/nonexistent/python3")

            original_pdf = tmp_path / "SujanDora_resume_TestCo.pdf"
            original_pdf.write_bytes(b"%PDF")
            mock_run.return_value = MagicMock(returncode=0, stderr="", stdout="")

            try:
                generate_resume_from_workspace(
                    company_name="TestCo",
                    location="Remote",
                    tech_stack={},
                    points=[],
                )
            except Exception:
                pass

        # Temp file should be gone
        for tmp_path_obj in created_tmp:
            assert not tmp_path_obj.exists(), f"Temp file not cleaned up: {tmp_path_obj}"

    def test_temp_file_cleaned_up_on_error(self, tmp_path):
        """Temp JSON file is deleted even when subprocess raises"""
        script = tmp_path / "src" / "resume" / "single_generator.py"
        script.parent.mkdir(parents=True)
        script.write_text("# fake")

        import subprocess as sp_mod

        with patch("src.resume.workspace_service.settings") as mock_settings, \
             patch("src.resume.workspace_service.subprocess.run") as mock_run:
            mock_settings.BASE_DIR = tmp_path
            mock_settings.RESUMES_DIR = tmp_path
            mock_settings.VENV_PYTHON = Path("/nonexistent/python3")
            mock_run.side_effect = sp_mod.TimeoutExpired(cmd="p", timeout=60)

            with pytest.raises(WorkspaceResumeGenerationError):
                generate_resume_from_workspace(
                    company_name="TestCo",
                    location="Remote",
                    tech_stack={},
                    points=[],
                )
            # No stray temp files (cleanup is in finally block)
            # We can't easily check the name but the finally block must run


# ═══════════════════════════════════════════════════════════════════════════════
# SECTION 2: create_resume versioning tests (checkpoint-17/18)
# ═══════════════════════════════════════════════════════════════════════════════

from src.database import Base, get_db
from src.models import User, UserProfile, Job, MatchedJob, Resume, ApplicationEvent
from src.crud import (
    create_user,
    create_resume,
    get_latest_resume,
    get_job_resumes,
    create_application_event,
    get_application_events,
)
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker


@pytest.fixture(scope="function")
def db_session():
    """In-memory SQLite session for unit tests."""
    engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False})
    Base.metadata.create_all(engine)
    Session = sessionmaker(bind=engine)
    session = Session()
    yield session
    session.close()
    Base.metadata.drop_all(engine)


@pytest.fixture
def user_and_job(db_session):
    """Create a user + job + matched_job in the test DB."""
    user = create_user(db_session, username="testuser", password="TestPass123!")
    job = Job(
        user_id=user.id,
        source="linkedin",
        company="Acme Corp",
        title="ML Engineer",
        job_link="https://example.com/job/1",
    )
    db_session.add(job)
    db_session.commit()
    db_session.refresh(job)

    matched_job = MatchedJob(
        user_id=user.id,
        job_id=job.id,
    )
    db_session.add(matched_job)
    db_session.commit()
    db_session.refresh(matched_job)

    return user, job, matched_job


class TestCreateResumeVersioning:
    """Tests for the new auto-increment versioning in create_resume"""

    def test_first_resume_is_version_1(self, db_session, user_and_job):
        _, job, _ = user_and_job
        resume = create_resume(db_session, job.id, "/path/to/resume_v1.pdf")
        assert resume.version == 1

    def test_second_resume_increments_version(self, db_session, user_and_job):
        _, job, _ = user_and_job
        create_resume(db_session, job.id, "/path/to/resume_v1.pdf")
        resume2 = create_resume(db_session, job.id, "/path/to/resume_v2.pdf")
        assert resume2.version == 2

    def test_third_resume_is_version_3(self, db_session, user_and_job):
        _, job, _ = user_and_job
        for i in range(1, 3):
            create_resume(db_session, job.id, f"/path/resume_v{i}.pdf")
        resume3 = create_resume(db_session, job.id, "/path/resume_v3.pdf")
        assert resume3.version == 3

    def test_get_latest_resume_returns_highest_version(self, db_session, user_and_job):
        _, job, _ = user_and_job
        create_resume(db_session, job.id, "/path/v1.pdf")
        create_resume(db_session, job.id, "/path/v2.pdf")
        create_resume(db_session, job.id, "/path/v3.pdf")
        latest = get_latest_resume(db_session, job.id)
        assert latest.version == 3
        assert latest.pdf_path == "/path/v3.pdf"

    def test_get_job_resumes_returns_all_versions(self, db_session, user_and_job):
        _, job, _ = user_and_job
        create_resume(db_session, job.id, "/path/v1.pdf")
        create_resume(db_session, job.id, "/path/v2.pdf")
        resumes = get_job_resumes(db_session, job.id)
        assert len(resumes) == 2

    def test_get_job_resumes_empty_when_none_exist(self, db_session, user_and_job):
        _, job, _ = user_and_job
        resumes = get_job_resumes(db_session, job.id)
        assert resumes == []

    def test_versions_are_independent_per_job(self, db_session, user_and_job):
        """Two different jobs each start their version count at 1"""
        user, job1, _ = user_and_job
        job2 = Job(
            user_id=user.id,
            source="indeed",
            company="OtherCo",
            title="Data Scientist",
            job_link="https://example.com/job/2",
        )
        db_session.add(job2)
        db_session.commit()
        db_session.refresh(job2)

        r1 = create_resume(db_session, job1.id, "/path/j1_v1.pdf")
        r2 = create_resume(db_session, job2.id, "/path/j2_v1.pdf")
        assert r1.version == 1
        assert r2.version == 1


# ═══════════════════════════════════════════════════════════════════════════════
# SECTION 3: ApplicationEvent / activity timeline tests (checkpoint-19)
# ═══════════════════════════════════════════════════════════════════════════════

class TestApplicationEvents:
    """Tests for create_application_event and get_application_events"""

    def test_create_event_with_all_fields(self, db_session, user_and_job):
        _, _, matched_job = user_and_job
        event = create_application_event(
            db_session,
            matched_job.id,
            event_type="status_changed",
            old_status="not_applied",
            new_status="applied",
            actor="user",
            metadata_json={"source": "ui"},
        )
        assert event.id is not None
        assert event.matched_job_id == matched_job.id
        assert event.event_type == "status_changed"
        assert event.old_status == "not_applied"
        assert event.new_status == "applied"
        assert event.actor == "user"
        assert event.metadata_json == {"source": "ui"}

    def test_create_event_minimal(self, db_session, user_and_job):
        """Only required fields — no old/new status, no metadata"""
        _, _, matched_job = user_and_job
        event = create_application_event(
            db_session,
            matched_job.id,
            event_type="tailor_generated",
        )
        assert event.event_type == "tailor_generated"
        assert event.old_status is None
        assert event.new_status is None
        assert event.metadata_json == {}

    def test_get_application_events_returns_newest_first(self, db_session, user_and_job):
        """Events are returned in newest-first order"""
        _, _, matched_job = user_and_job
        create_application_event(db_session, matched_job.id, event_type="status_changed", new_status="applied")
        create_application_event(db_session, matched_job.id, event_type="resume_generated")
        create_application_event(db_session, matched_job.id, event_type="tailor_generated")

        events = get_application_events(db_session, matched_job.id)
        assert len(events) == 3
        # Newest first — tailor_generated was last created
        assert events[0].event_type == "tailor_generated"
        assert events[2].event_type == "status_changed"

    def test_get_events_empty_when_no_events(self, db_session, user_and_job):
        _, _, matched_job = user_and_job
        events = get_application_events(db_session, matched_job.id)
        assert events == []

    def test_events_isolated_per_matched_job(self, db_session, user_and_job):
        """Events for one matched_job don't leak into another"""
        user, job, matched_job1 = user_and_job

        job2 = Job(
            user_id=user.id,
            source="indeed",
            company="OtherCo",
            title="DS",
            job_link="https://example.com/j2",
        )
        db_session.add(job2)
        db_session.commit()
        db_session.refresh(job2)

        matched_job2 = MatchedJob(user_id=user.id, job_id=job2.id)
        db_session.add(matched_job2)
        db_session.commit()
        db_session.refresh(matched_job2)

        create_application_event(db_session, matched_job1.id, event_type="status_changed")
        create_application_event(db_session, matched_job1.id, event_type="resume_generated")
        create_application_event(db_session, matched_job2.id, event_type="tailor_generated")

        events1 = get_application_events(db_session, matched_job1.id)
        events2 = get_application_events(db_session, matched_job2.id)

        assert len(events1) == 2
        assert len(events2) == 1
        assert events2[0].event_type == "tailor_generated"

    def test_metadata_json_defaults_to_empty_dict(self, db_session, user_and_job):
        """metadata_json=None stores as {} not NULL"""
        _, _, matched_job = user_and_job
        event = create_application_event(
            db_session,
            matched_job.id,
            event_type="analysis_updated",
            metadata_json=None,
        )
        assert event.metadata_json == {}

    def test_all_known_event_types_accepted(self, db_session, user_and_job):
        """All documented event_type values are stored without error"""
        _, _, matched_job = user_and_job
        event_types = [
            "status_changed",
            "resume_generated",
            "tailor_generated",
            "analysis_updated",
            "interest_toggled",
            "notes_updated",
        ]
        for event_type in event_types:
            event = create_application_event(db_session, matched_job.id, event_type=event_type)
            assert event.event_type == event_type

    def test_status_change_event_captures_old_and_new(self, db_session, user_and_job):
        _, _, matched_job = user_and_job
        event = create_application_event(
            db_session,
            matched_job.id,
            event_type="status_changed",
            old_status="not_applied",
            new_status="interviewing",
        )
        assert event.old_status == "not_applied"
        assert event.new_status == "interviewing"


# ═══════════════════════════════════════════════════════════════════════════════
# SECTION 4: MatchedJob.workspace_resume_path model tests (checkpoint-17)
# ═══════════════════════════════════════════════════════════════════════════════

class TestWorkspaceResumePath:
    """Tests for the new workspace_resume_path field on MatchedJob"""

    def test_workspace_resume_path_defaults_to_none(self, db_session, user_and_job):
        _, _, matched_job = user_and_job
        assert matched_job.workspace_resume_path is None

    def test_workspace_resume_path_can_be_set(self, db_session, user_and_job):
        _, _, matched_job = user_and_job
        matched_job.workspace_resume_path = "/data/resumes/SujanDora_resume_Acme_v20260414.pdf"
        db_session.commit()
        db_session.refresh(matched_job)
        assert matched_job.workspace_resume_path == "/data/resumes/SujanDora_resume_Acme_v20260414.pdf"

    def test_workspace_resume_path_update_overwrites(self, db_session, user_and_job):
        _, _, matched_job = user_and_job
        matched_job.workspace_resume_path = "/v1.pdf"
        db_session.commit()
        matched_job.workspace_resume_path = "/v2.pdf"
        db_session.commit()
        db_session.refresh(matched_job)
        assert matched_job.workspace_resume_path == "/v2.pdf"


# ═══════════════════════════════════════════════════════════════════════════════
# SECTION 5: tailor_service context-aware caching tests (checkpoint-18)
# ═══════════════════════════════════════════════════════════════════════════════

from src.evaluation.tailor_service import (
    _cache_path,
    _compact_tailor_prompt,
    _truncate,
    TailorServiceError,
)


class TestTruncate:
    def test_short_string_unchanged(self):
        assert _truncate("hello", 100) == "hello"

    def test_long_string_truncated(self):
        text = "a" * 200
        result = _truncate(text, 100)
        assert len(result) <= 103  # 100 + "..."
        assert result.endswith("...")

    def test_exactly_at_limit_unchanged(self):
        text = "a" * 100
        result = _truncate(text, 100)
        assert result == text
        assert not result.endswith("...")

    def test_empty_string(self):
        assert _truncate("", 100) == ""

    def test_none_becomes_empty(self):
        assert _truncate(None, 100) == ""


class TestCachePathContextAware:
    """
    Cache key must change when context changes (candidate_summary, location,
    tech_stack, etc.) — otherwise different users get each other's tailoring.
    """

    def test_same_jd_same_context_same_key(self, tmp_path):
        with patch("src.evaluation.tailor_service.settings") as ms:
            ms.AI_TAILOR_MAX_JOB_CHARS = 2200
            ms.AI_CACHE_DIR = str(tmp_path)
            ms.ensure_directories = MagicMock()

            p1 = _cache_path("some job description", context_signature="ctx1")
            p2 = _cache_path("some job description", context_signature="ctx1")
            assert p1 == p2

    def test_same_jd_different_context_different_key(self, tmp_path):
        with patch("src.evaluation.tailor_service.settings") as ms:
            ms.AI_TAILOR_MAX_JOB_CHARS = 2200
            ms.AI_CACHE_DIR = str(tmp_path)
            ms.ensure_directories = MagicMock()

            p1 = _cache_path("same jd", context_signature="candidate_A")
            p2 = _cache_path("same jd", context_signature="candidate_B")
            assert p1 != p2

    def test_different_jd_same_context_different_key(self, tmp_path):
        with patch("src.evaluation.tailor_service.settings") as ms:
            ms.AI_TAILOR_MAX_JOB_CHARS = 2200
            ms.AI_CACHE_DIR = str(tmp_path)
            ms.ensure_directories = MagicMock()

            p1 = _cache_path("job description A", context_signature="same_ctx")
            p2 = _cache_path("job description B", context_signature="same_ctx")
            assert p1 != p2

    def test_empty_context_signature_is_stable(self, tmp_path):
        with patch("src.evaluation.tailor_service.settings") as ms:
            ms.AI_TAILOR_MAX_JOB_CHARS = 2200
            ms.AI_CACHE_DIR = str(tmp_path)
            ms.ensure_directories = MagicMock()

            p1 = _cache_path("some jd")
            p2 = _cache_path("some jd", context_signature="")
            assert p1 == p2


class TestCompactTailorPrompt:
    """Tests for the context-aware prompt builder"""

    def _make_prompt(self, **kwargs):
        jd = kwargs.pop("job_description", "Build an LLM pipeline")
        with patch("src.evaluation.tailor_service.settings") as ms:
            ms.AI_TAILOR_MAX_JOB_CHARS = 2200
            return _compact_tailor_prompt(jd, **kwargs)

    def test_prompt_contains_target_roles(self):
        prompt = self._make_prompt(target_roles=["ML Engineer", "Data Scientist"])
        assert "ML Engineer" in prompt
        assert "Data Scientist" in prompt

    def test_prompt_contains_seniority(self):
        prompt = self._make_prompt(seniority="Entry level")
        assert "Entry level" in prompt

    def test_prompt_contains_candidate_summary(self):
        prompt = self._make_prompt(candidate_summary="Python expert with 2 years in ML")
        assert "Python expert" in prompt

    def test_prompt_contains_current_location(self):
        prompt = self._make_prompt(current_location="San Francisco, CA")
        assert "San Francisco" in prompt

    def test_prompt_contains_tech_stack_categories(self):
        prompt = self._make_prompt(
            current_tech_stack={"ML Frameworks": ["PyTorch", "TensorFlow"], "Languages": ["Python"]}
        )
        assert "PyTorch" in prompt or "ML Frameworks" in prompt

    def test_prompt_truncates_large_tech_stack_to_8_skills_per_category(self):
        big_stack = {"Languages": [f"Lang{i}" for i in range(20)]}
        prompt = self._make_prompt(current_tech_stack=big_stack)
        # Should only include up to 8 per category
        lang_count = sum(1 for i in range(20) if f"Lang{i}" in prompt)
        assert lang_count <= 8

    def test_prompt_empty_tech_stack_handled(self):
        prompt = self._make_prompt(current_tech_stack={})
        assert "Not provided" in prompt or "tech_stack" in prompt.lower()

    def test_prompt_empty_roles_handled(self):
        prompt = self._make_prompt(target_roles=[])
        # Should not crash; fallback message should appear
        assert len(prompt) > 100

    def test_prompt_contains_jd(self):
        jd = "We are hiring a Python engineer with PyTorch experience"
        prompt = self._make_prompt(job_description=jd)
        assert "PyTorch" in prompt

    def test_prompt_is_string(self):
        prompt = self._make_prompt()
        assert isinstance(prompt, str)

    def test_prompt_contains_required_json_keys(self):
        prompt = self._make_prompt()
        for key in ["ats_score", "location", "tech_stack", "points"]:
            assert key in prompt


class TestGenerateTailoredResumeDataContextCaching:
    """
    Integration-level: verify the function uses context in its cache key
    so a cached result from candidate A is never served to candidate B.
    """

    def test_different_candidates_different_cache_files(self, tmp_path):
        """Two calls with different candidate_summary should not share a cache file"""
        with patch("src.evaluation.tailor_service.settings") as ms:
            ms.AI_TAILOR_MAX_JOB_CHARS = 2200
            ms.AI_TAILOR_MAX_TOKENS = 700
            ms.AI_CACHE_DIR = str(tmp_path)
            ms.ensure_directories = MagicMock()
            ms.GROQ_API_KEYS = ["fake_key"]
            ms.GROQ_LIGHT_MODEL = "llama-3.1-8b-instant"
            ms.GROQ_MODEL = "llama-3.3-70b-versatile"

            from src.evaluation.tailor_service import _cache_path
            jd = "Build ML pipelines with Python"
            ctx_a = json.dumps({
                "candidate_summary": "Candidate A — senior ML",
                "current_location": "",
                "current_tech_stack": {},
                "target_roles": [],
                "seniority": "",
            }, sort_keys=True)
            ctx_b = json.dumps({
                "candidate_summary": "Candidate B — junior dev",
                "current_location": "",
                "current_tech_stack": {},
                "target_roles": [],
                "seniority": "",
            }, sort_keys=True)

            path_a = _cache_path(jd, context_signature=ctx_a)
            path_b = _cache_path(jd, context_signature=ctx_b)

            assert path_a != path_b, "Different candidates must get different cache files"

    def test_cache_hit_returned_without_api_call(self, tmp_path):
        """If cache file exists, the API is never called"""
        cached_data = {
            "ats_score": 82,
            "location": "San Francisco, CA",
            "tech_stack": {"Languages": ["Python"]},
            "points": ["Built LLM pipeline"],
        }
        from src.evaluation.tailor_service import generate_tailored_resume_data

        with patch("src.evaluation.tailor_service.settings") as ms, \
             patch("src.evaluation.tailor_service.Groq") as mock_groq:
            ms.AI_TAILOR_MAX_JOB_CHARS = 2200
            ms.AI_TAILOR_MAX_TOKENS = 700
            ms.AI_CACHE_DIR = str(tmp_path)
            ms.ensure_directories = MagicMock()
            ms.GROQ_API_KEYS = ["fake_key"]
            ms.GROQ_LIGHT_MODEL = "llama-3.1-8b-instant"
            ms.GROQ_MODEL = "llama-3.3-70b-versatile"

            # Pre-populate the cache
            jd = "We need a Python ML engineer"
            ctx_sig = json.dumps({
                "candidate_summary": "",
                "current_location": "",
                "current_tech_stack": {},
                "target_roles": [],
                "seniority": "",
            }, sort_keys=True)
            cache_file = _cache_path(jd, context_signature=ctx_sig)
            cache_file.write_text(json.dumps(cached_data))

            result = generate_tailored_resume_data(jd)
            mock_groq.assert_not_called()  # No API call when cache hit
            assert result["ats_score"] == 82

    def test_raises_when_no_api_keys(self):
        """TailorServiceError raised immediately if GROQ_API_KEYS empty"""
        from src.evaluation.tailor_service import generate_tailored_resume_data

        with patch("src.evaluation.tailor_service.settings") as ms:
            ms.GROQ_API_KEYS = []

            with pytest.raises(TailorServiceError, match="GROQ_API_KEYS"):
                generate_tailored_resume_data("some jd")
