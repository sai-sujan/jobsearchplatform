from __future__ import annotations
from pydantic import BaseModel, Field
from typing import Dict, List, Literal, Optional, Type

class ScoringOutput(BaseModel):
    ats_score: int = Field(ge=0, le=100)
    skill_match_pct: int = Field(ge=0, le=100)
    missing_skills: List[str]
    recruiter_verdict: Literal["strong_yes", "yes", "maybe", "no"]
    one_line_reason: str

class TailoringOutput(BaseModel):
    bullets: List[str]
    keywords_used: List[str]
    kept_truthful: bool

class FormFillOutput(BaseModel):
    fills: Dict[str, Optional[str]]
    low_confidence: List[str]

SCHEMAS: Dict[str, Type[BaseModel]] = {
    "ScoringOutput": ScoringOutput,
    "TailoringOutput": TailoringOutput,
    "FormFillOutput": FormFillOutput,
}
