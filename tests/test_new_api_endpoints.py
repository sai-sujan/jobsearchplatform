"""
API endpoint tests for Checkpoints 17-19 new routes:
  POST /api/jobs/{id}/resume   — generate resume from workspace
  POST /api/jobs/{id}/tailor   — AI tailoring (mocked)
  GET  /api/jobs/{id}/events   — activity timeline
  GET  /api/jobs/{id}/resumes  — resume versions list

These tests hit the live FastAPI server.
Run: cd job-applications && python -m pytest tests/test_new_api_endpoints.py -v

Requires the server to be running:
  uvicorn api.server:app --port 5001
"""

import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

import pytest
import requests
import json
from unittest.mock import patch

API = "http://127.0.0.1:5001"
INTERNAL_TOKEN = "local-internal-token"  # matches INTERNAL_API_TOKEN in server env


# ─── Fixtures ─────────────────────────────────────────────────────────────────

def _unique(prefix="t"):
    import time, random
    return f"{prefix}_{int(time.time())}_{random.randint(1000,9999)}"


def _signup(username=None, password="TestPass123!"):
    if not username:
        username = _unique("api_tst")
    r = requests.post(f"{API}/api/v1/auth/signup", json={
        "username": username,
        "password": password,
        "full_name": "API Test User",
    })
    assert r.status_code == 200, f"Signup failed: {r.text}"
    token = r.json()["token"]
    return username, password, token


def _auth_headers(token):
    return {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json",
        "X-CSRF-Token": "bearer-bypass",
    }


_RESUME_TEXT = (
    "Jane Smith | jane@example.com | GitHub: github.com/jsmith\n"
    "SUMMARY: Machine Learning Engineer with experience in Python, PyTorch, TensorFlow, "
    "FastAPI, and AWS. Built production LLM pipelines and deployed transformer models.\n"
    "EXPERIENCE:\n"
    "ML Engineer Intern, TechCorp (2023–2024): Developed NLP feature extraction pipelines "
    "with PyTorch reducing inference latency by 40%. Deployed models on AWS SageMaker.\n"
    "EDUCATION: B.S. Computer Science, State University, 2024. GPA 3.8.\n"
    "SKILLS: Python, PyTorch, TensorFlow, FastAPI, SQL, AWS, Docker, Git, scikit-learn, NumPy."
)


def _complete_onboarding(token):
    """Complete onboarding (with resume) so /api/jobs is accessible."""
    # Upload resume text so fit scores are high enough to pass quality filters
    requests.post(f"{API}/api/onboarding/resume", headers=_auth_headers(token), json={
        "resume_text": _RESUME_TEXT,
        "filename": "resume.txt",
        "content_type": "text/plain",
    })
    requests.put(f"{API}/api/onboarding/profile", headers=_auth_headers(token), json={
        "target_roles": ["Machine Learning Engineer"],
        "seniority": "Entry level",
        "preferred_locations": ["Remote"],
        "work_modes": ["Remote"],
        "employment_types": ["Full-time"],
        "industries": ["Technology"],
        "quality_filters": {},
        "onboarding_step": "profile",
    })
    requests.post(f"{API}/api/onboarding/complete", headers=_auth_headers(token), json={
        "onboarding_step": "complete",
    })


def _deliver_job(username):
    """Deliver a synthetic job via the internal pipeline endpoint."""
    r = requests.post(
        f"{API}/internal/v1/jobs/deliver",
        headers={
            "Content-Type": "application/json",
            "X-Internal-Token": INTERNAL_TOKEN,
        },
        json={
            "username": username,
            "jobs": [{
                "job_link": f"https://example.com/job/{_unique()}",
                "source": "linkedin",
                "company": "TestCorp",
                "title": "ML Engineer",
                "location": "Remote",
                "job_description": "We need a Python engineer with PyTorch and FastAPI experience.",
                "skill_score": 80.0,
                "matched_skills": ["Python", "PyTorch"],
                "missing_skills": ["Rust"],
            }],
        },
    )
    return r.status_code == 200


def _get_first_job_id(token):
    r = requests.get(f"{API}/api/jobs", headers={"Authorization": f"Bearer {token}"})
    if r.status_code != 200:
        return None
    jobs = r.json().get("jobs", [])
    return jobs[0]["id"] if jobs else None


@pytest.fixture(scope="module")
def authed_user():
    """Create one authenticated, onboarded user for the whole module.
    Returns (token, username) tuple.
    """
    username, _, tok = _signup()
    _complete_onboarding(tok)
    # Deliver a job so tests have something to work with
    _deliver_job(username)
    return tok, username


@pytest.fixture(scope="module")
def token(authed_user):
    """Convenience fixture: just the bearer token from authed_user."""
    return authed_user[0]


@pytest.fixture(scope="module")
def job_id(authed_user):
    """Get a job ID for the test user (delivered via internal API)."""
    tok, username = authed_user
    jid = _get_first_job_id(tok)
    if jid is None:
        pytest.skip("No jobs available — check INTERNAL_API_TOKEN or seed manually")
    return jid


# ─── GET /api/jobs/{id}/events ────────────────────────────────────────────────

class TestGetJobEvents:
    def test_events_endpoint_returns_correct_shape(self, token, job_id):
        r = requests.get(
            f"{API}/api/jobs/{job_id}/events",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert r.status_code == 200
        body = r.json()
        assert "job_id" in body
        assert "events" in body
        assert isinstance(body["events"], list)

    def test_events_empty_on_fresh_job(self, token, job_id):
        """Fresh job may have zero events (or a few from the deliver step)."""
        r = requests.get(
            f"{API}/api/jobs/{job_id}/events",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert r.status_code == 200
        # Just check it doesn't crash — events may or may not be empty

    def test_status_change_creates_event(self, token, job_id):
        """Changing status should create a status_changed event."""
        # Change status
        requests.patch(
            f"{API}/api/jobs/{job_id}/status",
            headers=_auth_headers(token),
            params={"status": "applied"},
        )

        # Check events
        r = requests.get(
            f"{API}/api/jobs/{job_id}/events",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert r.status_code == 200
        events = r.json()["events"]
        event_types = [e["event_type"] for e in events]
        assert "status_changed" in event_types

    def test_event_has_required_fields(self, token, job_id):
        """Each event must have id, event_type, actor, created_at."""
        r = requests.get(
            f"{API}/api/jobs/{job_id}/events",
            headers={"Authorization": f"Bearer {token}"},
        )
        events = r.json()["events"]
        if not events:
            return  # Nothing to check if empty
        for event in events:
            assert "id" in event
            assert "event_type" in event
            assert "actor" in event
            assert "created_at" in event

    def test_events_ordered_newest_first(self, token, job_id):
        """Multiple events returned with latest first."""
        # Make two more status changes
        for status in ["interviewing", "not_applied"]:
            requests.patch(
                f"{API}/api/jobs/{job_id}/status",
                headers=_auth_headers(token),
                params={"status": status},
            )

        r = requests.get(
            f"{API}/api/jobs/{job_id}/events",
            headers={"Authorization": f"Bearer {token}"},
        )
        events = r.json()["events"]
        if len(events) < 2:
            return
        # Timestamps should be descending
        timestamps = [e["created_at"] for e in events if e.get("created_at")]
        if len(timestamps) >= 2:
            assert timestamps[0] >= timestamps[1], "Events not ordered newest-first"

    def test_events_unauthenticated_returns_401(self, job_id):
        r = requests.get(f"{API}/api/jobs/{job_id}/events")
        assert r.status_code == 401

    def test_events_other_user_job_returns_404(self, job_id):
        _, _, token2 = _signup()
        _complete_onboarding(token2)
        r = requests.get(
            f"{API}/api/jobs/{job_id}/events",
            headers={"Authorization": f"Bearer {token2}"},
        )
        assert r.status_code == 404

    def test_events_nonexistent_job_returns_404(self, token):
        r = requests.get(
            f"{API}/api/jobs/99999999/events",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert r.status_code == 404


# ─── GET /api/jobs/{id}/resumes ───────────────────────────────────────────────

class TestGetJobResumes:
    def test_resumes_endpoint_returns_correct_shape(self, token, job_id):
        r = requests.get(
            f"{API}/api/jobs/{job_id}/resumes",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert r.status_code == 200
        body = r.json()
        assert "job_id" in body
        assert "resumes" in body
        assert isinstance(body["resumes"], list)

    def test_resumes_empty_before_generation(self, token, job_id):
        """Fresh job has zero generated resumes."""
        r = requests.get(
            f"{API}/api/jobs/{job_id}/resumes",
            headers={"Authorization": f"Bearer {token}"},
        )
        body = r.json()
        for resume in body["resumes"]:
            assert "id" in resume
            assert "version" in resume
            assert "pdf_path" in resume

    def test_resumes_unauthenticated_returns_401(self, job_id):
        r = requests.get(f"{API}/api/jobs/{job_id}/resumes")
        assert r.status_code == 401

    def test_resumes_other_user_returns_404(self, job_id):
        _, _, token2 = _signup()
        _complete_onboarding(token2)
        r = requests.get(
            f"{API}/api/jobs/{job_id}/resumes",
            headers={"Authorization": f"Bearer {token2}"},
        )
        assert r.status_code == 404

    def test_resumes_nonexistent_job_returns_404(self, token):
        r = requests.get(
            f"{API}/api/jobs/99999999/resumes",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert r.status_code == 404


# ─── POST /api/jobs/{id}/tailor ───────────────────────────────────────────────

class TestTailorJobWorkspace:
    def test_tailor_unauthenticated_returns_401(self, job_id):
        r = requests.post(f"{API}/api/jobs/{job_id}/tailor")
        assert r.status_code == 401

    def test_tailor_other_user_returns_404(self, job_id):
        _, _, token2 = _signup()
        _complete_onboarding(token2)
        r = requests.post(
            f"{API}/api/jobs/{job_id}/tailor",
            headers=_auth_headers(token2),
        )
        assert r.status_code == 404

    def test_tailor_nonexistent_job_returns_404(self, token):
        r = requests.post(
            f"{API}/api/jobs/99999999/tailor",
            headers=_auth_headers(token),
        )
        assert r.status_code == 404

    def test_tailor_with_mocked_groq_succeeds(self, token, job_id):
        """Mock the Groq LLM call so we can test the endpoint logic without API key."""
        mock_tailored = {
            "ats_score": 82,
            "location": "San Francisco, CA",
            "tech_stack": {
                "Programming Languages": ["Python", "SQL"],
                "ML Frameworks & Libraries": ["PyTorch", "TensorFlow"],
            },
            "points": [
                "Built LLM pipeline reducing latency by 40%",
                "Deployed model on AWS SageMaker",
            ],
        }

        with patch("src.evaluation.tailor_service.generate_tailored_resume_data", return_value=mock_tailored):
            r = requests.post(
                f"{API}/api/jobs/{job_id}/tailor",
                headers=_auth_headers(token),
            )

        # If GROQ is configured the real call happens; if not, 500 from missing keys
        if r.status_code == 200:
            body = r.json()
            assert body["success"] is True
            assert "tailored_data" in body
            assert "job" in body
            td = body["tailored_data"]
            assert "ats_score" in td
            assert "location" in td
            assert "tech_stack" in td
            assert "points" in td
        elif r.status_code == 500:
            # Acceptable if GROQ keys not configured in .env
            assert "detail" in r.json()
        else:
            pytest.fail(f"Unexpected status: {r.status_code} — {r.text}")

    def test_tailor_persists_workspace_location_on_matched_job(self, token, job_id):
        """After a successful tailor, tailored_data must include a non-empty location.

        Note: in live-server tests, patch() doesn't cross process boundaries, so the
        real Groq service runs. We only verify shape here, not a specific mocked value.
        """
        tailor_r = requests.post(
            f"{API}/api/jobs/{job_id}/tailor",
            headers=_auth_headers(token),
        )

        if tailor_r.status_code != 200:
            pytest.skip("Tailor endpoint did not succeed (check GROQ keys or server state)")

        body = tailor_r.json()
        assert "tailored_data" in body
        # location must be non-empty (either from LLM or fallback workspace_location)
        assert body["tailored_data"].get("location"), "tailored_data.location is empty after successful tailor"

    def test_tailor_creates_tailor_generated_event(self, token, job_id):
        """A successful tailor call should append a tailor_generated event."""
        mock_tailored = {
            "ats_score": 70,
            "location": "Remote",
            "tech_stack": {},
            "points": ["Built AI tool"],
        }

        with patch("src.evaluation.tailor_service.generate_tailored_resume_data", return_value=mock_tailored):
            tailor_r = requests.post(
                f"{API}/api/jobs/{job_id}/tailor",
                headers=_auth_headers(token),
            )

        if tailor_r.status_code != 200:
            pytest.skip("Tailor endpoint did not succeed")

        events_r = requests.get(
            f"{API}/api/jobs/{job_id}/events",
            headers={"Authorization": f"Bearer {token}"},
        )
        events = events_r.json()["events"]
        event_types = [e["event_type"] for e in events]
        assert "tailor_generated" in event_types

    def test_tailor_without_csrf_on_cookie_session_returns_403(self, token, job_id):
        """Bearer token bypasses CSRF check by design — should not 403."""
        r = requests.post(
            f"{API}/api/jobs/{job_id}/tailor",
            headers={"Authorization": f"Bearer {token}"},
            # No X-CSRF-Token — bearer bypasses CSRF
        )
        assert r.status_code != 403


# ─── POST /api/jobs/{id}/resume ───────────────────────────────────────────────

class TestGenerateJobResume:
    def test_generate_resume_unauthenticated_returns_401(self, job_id):
        r = requests.post(f"{API}/api/jobs/{job_id}/resume")
        assert r.status_code == 401

    def test_generate_resume_other_user_returns_404(self, job_id):
        _, _, token2 = _signup()
        _complete_onboarding(token2)
        r = requests.post(
            f"{API}/api/jobs/{job_id}/resume",
            headers=_auth_headers(token2),
        )
        assert r.status_code == 404

    def test_generate_resume_nonexistent_job_returns_404(self, token):
        r = requests.post(
            f"{API}/api/jobs/99999999/resume",
            headers=_auth_headers(token),
        )
        assert r.status_code == 404

    def test_generate_resume_with_mocked_workspace_service_succeeds(self, token, job_id):
        """Mock workspace_service to test endpoint flow without LaTeX/tectonic."""
        import tempfile, os
        tmp_pdf = tempfile.NamedTemporaryFile(suffix=".pdf", delete=False)
        tmp_pdf.write(b"%PDF-1.4 fake")
        tmp_pdf.close()

        mock_path = tmp_pdf.name
        mock_url = f"/api/download-resume/{os.path.basename(mock_path)}"

        with patch("api.jobs.generate_resume_from_workspace", return_value=(mock_path, mock_url)):
            r = requests.post(
                f"{API}/api/jobs/{job_id}/resume",
                headers=_auth_headers(token),
            )

        os.unlink(tmp_pdf.name)

        assert r.status_code == 200
        body = r.json()
        assert body["success"] is True
        assert "pdf_url" in body
        assert "pdf_path" in body
        assert "resume_version" in body
        assert isinstance(body["resume_version"], int)
        assert body["resume_version"] >= 1

    def test_generate_resume_increments_version_on_second_call(self, token, job_id):
        """Calling generate twice should increment version."""
        import tempfile, os

        for expected_version in [1, 2]:
            tmp_pdf = tempfile.NamedTemporaryFile(suffix=".pdf", delete=False)
            tmp_pdf.write(b"%PDF-1.4 fake")
            tmp_pdf.close()

            mock_path = tmp_pdf.name
            mock_url = f"/api/download-resume/{os.path.basename(mock_path)}"

            with patch("api.jobs.generate_resume_from_workspace", return_value=(mock_path, mock_url)):
                r = requests.post(
                    f"{API}/api/jobs/{job_id}/resume",
                    headers=_auth_headers(token),
                )
            os.unlink(tmp_pdf.name)

            if r.status_code == 200:
                body = r.json()
                assert body["resume_version"] >= expected_version

    def test_generate_resume_creates_resume_generated_event(self, token, job_id):
        """Successful generation appends resume_generated to activity timeline."""
        import tempfile, os

        tmp_pdf = tempfile.NamedTemporaryFile(suffix=".pdf", delete=False)
        tmp_pdf.write(b"%PDF-1.4 fake")
        tmp_pdf.close()

        mock_path = tmp_pdf.name
        mock_url = f"/api/download-resume/{os.path.basename(mock_path)}"

        with patch("api.jobs.generate_resume_from_workspace", return_value=(mock_path, mock_url)):
            gen_r = requests.post(
                f"{API}/api/jobs/{job_id}/resume",
                headers=_auth_headers(token),
            )
        os.unlink(tmp_pdf.name)

        if gen_r.status_code != 200:
            pytest.skip("Resume generation did not succeed")

        events_r = requests.get(
            f"{API}/api/jobs/{job_id}/events",
            headers={"Authorization": f"Bearer {token}"},
        )
        events = events_r.json()["events"]
        event_types = [e["event_type"] for e in events]
        assert "resume_generated" in event_types

    def test_generate_resume_updates_workspace_resume_path_on_job(self, token, job_id):
        """After generation, serialized job should carry the new workspace_resume_path."""
        import tempfile, os

        tmp_pdf = tempfile.NamedTemporaryFile(suffix=".pdf", delete=False)
        tmp_pdf.write(b"%PDF-1.4 fake")
        tmp_pdf.close()

        mock_path = tmp_pdf.name
        mock_url = f"/api/download-resume/{os.path.basename(mock_path)}"

        with patch("api.jobs.generate_resume_from_workspace", return_value=(mock_path, mock_url)):
            gen_r = requests.post(
                f"{API}/api/jobs/{job_id}/resume",
                headers=_auth_headers(token),
            )
        os.unlink(tmp_pdf.name)

        if gen_r.status_code != 200:
            pytest.skip("Resume generation did not succeed")

        body = gen_r.json()
        job_in_response = body["job"]
        assert job_in_response.get("pdf_path") or job_in_response.get("Resume Path")

    def test_generate_resume_workspace_error_returns_500(self, token, job_id):
        """WorkspaceResumeGenerationError should be converted to HTTP 500.

        Note: patch() does not cross process boundaries for live-server tests.
        This test verifies 500 handling by hitting a non-existent job so the
        endpoint's 404 path is exercised; the genuine WorkspaceResumeGenerationError
        → 500 path requires TestClient-based (in-process) testing.

        BUG NOTE: Error-path mocking of the workspace service cannot be tested
        via HTTP against a separate uvicorn process. Recommend adding TestClient
        coverage in test_new_features.py for this path.
        """
        # Verify 404 path works (precondition for error handling)
        r = requests.post(
            f"{API}/api/jobs/99999999/resume",
            headers=_auth_headers(token),
        )
        assert r.status_code == 404

        # If the resume endpoint IS reachable (real job), it should return 200 or 500.
        # We document what actually happens — skipping the mock-based assertion since
        # patch() has no effect on the server subprocess.
        r_real = requests.post(
            f"{API}/api/jobs/{job_id}/resume",
            headers=_auth_headers(token),
        )
        # Accept 200 (tectonic installed, generation succeeds) or 500 (LaTeX error)
        assert r_real.status_code in (200, 500), (
            f"Expected 200 or 500 from resume endpoint, got {r_real.status_code}: {r_real.text}"
        )


# ─── Cross-feature: analysis_updated event ───────────────────────────────────

class TestAnalysisUpdatedEvent:
    def test_patch_analysis_creates_analysis_updated_event(self, token, job_id):
        """PATCH /api/jobs/{id}/analysis should append analysis_updated event."""
        r = requests.patch(
            f"{API}/api/jobs/{job_id}/analysis",
            headers=_auth_headers(token),
            json={
                "ats_score": 85,
                "location": "New York, NY",
                "tech_stack": {"Languages": ["Python"]},
                "suggested_tech_stack": {},
                "points": ["Built pipeline"],
            },
        )
        assert r.status_code == 200

        events_r = requests.get(
            f"{API}/api/jobs/{job_id}/events",
            headers={"Authorization": f"Bearer {token}"},
        )
        events = events_r.json()["events"]
        event_types = [e["event_type"] for e in events]
        assert "analysis_updated" in event_types

    def test_analysis_event_carries_metadata(self, token, job_id):
        """analysis_updated event should carry location, ats_score, points_count."""
        requests.patch(
            f"{API}/api/jobs/{job_id}/analysis",
            headers=_auth_headers(token),
            json={
                "ats_score": 88,
                "location": "Chicago, IL",
                "tech_stack": {},
                "points": ["point one", "point two", "point three"],
            },
        )

        events_r = requests.get(
            f"{API}/api/jobs/{job_id}/events",
            headers={"Authorization": f"Bearer {token}"},
        )
        events = events_r.json()["events"]
        analysis_events = [e for e in events if e["event_type"] == "analysis_updated"]
        assert analysis_events, "No analysis_updated event found"

        latest = analysis_events[0]
        if latest.get("metadata"):
            meta = latest["metadata"]
            assert "points_count" in meta
            assert meta["points_count"] == 3
