from __future__ import annotations

from enum import Enum
from dataclasses import dataclass, field


class Task(str, Enum):
    SCORE = "score"
    TAILOR = "tailor"
    COVER_LETTER = "cover_letter"
    QA_BEHAVIORAL = "qa_behavioral"
    FORM_FILL = "form_fill"
    EMBED = "embed"
    DECIDE = "decide"


@dataclass(frozen=True)
class ModelProfile:
    provider: str        # "groq" | "gemini" | "anthropic"
    model: str           # concrete model id
    temperature: float
    max_tokens: int
    json_mode: bool
    cache_system: bool = False


@dataclass(frozen=True)
class RoutingDecision:
    task: Task
    primary: ModelProfile
    fallbacks: list[ModelProfile] = field(default_factory=list)
