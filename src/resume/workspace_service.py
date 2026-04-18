"""Workspace-driven resume generation helpers."""

from __future__ import annotations

import json
import re
import subprocess
import tempfile
from datetime import datetime
from pathlib import Path
from typing import Any

from src.settings import settings


class WorkspaceResumeGenerationError(Exception):
    """Raised when workspace resume generation fails."""


def _sanitize_latex_string(text: Any) -> Any:
    """Replace the most common problematic characters before LaTeX compilation."""
    if not isinstance(text, str):
        return text

    text = text.replace("–", "-").replace("—", "-")
    text = text.replace("“", '"').replace("”", '"')
    text = text.replace("‘", "'").replace("’", "'")
    text = text.replace("…", "...")
    text = text.replace("~", r"\textasciitilde{}")
    text = re.sub(r"(?<!\\)%", r"\\%", text)
    return text


def _sanitize_data(data: Any) -> Any:
    """Recursively sanitize all strings in a JSON-like structure."""
    if isinstance(data, dict):
        return {key: _sanitize_data(value) for key, value in data.items()}
    if isinstance(data, list):
        return [_sanitize_data(item) for item in data]
    if isinstance(data, str):
        return _sanitize_latex_string(data)
    return data


def generate_resume_from_workspace(
    *,
    company_name: str,
    location: str,
    tech_stack: dict,
    points: list[str],
    user_name: str = "Candidate",
) -> tuple[str, str]:
    """Generate a PDF resume from the matched-job workspace and return path + download URL."""
    script_path = settings.BASE_DIR / "src" / "resume" / "single_generator.py"
    if not script_path.exists():
        raise WorkspaceResumeGenerationError("Resume generator script not found")

    resume_data = _sanitize_data(
        {
            "location": location,
            "tech_stack": tech_stack,
            "points": points,
        }
    )

    with tempfile.NamedTemporaryFile(mode="w", suffix=".json", delete=False) as handle:
        json.dump(resume_data, handle, indent=2)
        temp_json_path = Path(handle.name)

    venv_python = settings.VENV_PYTHON
    if not venv_python.exists():
        venv_python = Path("python3")

    env = __import__("os").environ.copy()
    env["PATH"] = ":".join(
        [
            "/opt/homebrew/bin",
            "/usr/local/bin",
            str(Path.home() / ".cargo" / "bin"),
            "/opt/anaconda3/bin",
            env.get("PATH", ""),
        ]
    )

    safe_name = re.sub(r"[^\w\s-]", "", user_name).replace(" ", "") or "Candidate"
    safe_company = re.sub(r"[^\w\s-]", "", company_name).replace(" ", "_") or "Unknown"
    output_stem = f"{safe_name}_resume_{safe_company}"
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    original_pdf = settings.RESUMES_DIR / f"{output_stem}.pdf"
    versioned_pdf = settings.RESUMES_DIR / f"{output_stem}_v{timestamp}.pdf"

    try:
        result = subprocess.run(
            [str(venv_python), str(script_path), str(temp_json_path), company_name, output_stem],
            capture_output=True,
            text=True,
            timeout=60,
            env=env,
        )
    except subprocess.TimeoutExpired as error:
        raise WorkspaceResumeGenerationError("Resume generation timed out") from error
    finally:
        if temp_json_path.exists():
            temp_json_path.unlink()

    if result.returncode != 0:
        error_msg = result.stderr if result.stderr else result.stdout
        raise WorkspaceResumeGenerationError(
            f"Resume generation failed (code {result.returncode}): {error_msg}"
        )

    if not original_pdf.exists():
        raise WorkspaceResumeGenerationError("PDF was not generated")

    original_pdf.rename(versioned_pdf)
    return str(versioned_pdf), f"/api/download-resume/{versioned_pdf.name}"
