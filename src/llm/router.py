from __future__ import annotations

from .types import Task, ModelProfile, RoutingDecision

# ---------------------------------------------------------------------------
# Routing table — maps each Task to a primary ModelProfile and ordered list
# of fallback profiles.  Profiles are selected based on cost/quality tradeoffs:
#   SCORE / TAILOR / QA_BEHAVIORAL  → fast, cheap models (Gemini Flash Lite first)
#   COVER_LETTER                    → higher-quality model (Gemini Flash)
#   FORM_FILL                       → lightweight, deterministic (Groq 8B)
#   EMBED                           → dedicated embedding model
#   DECIDE                          → cheapest capable model
# ---------------------------------------------------------------------------

ROUTING_TABLE: dict[Task, RoutingDecision] = {
    Task.SCORE: RoutingDecision(
        task=Task.SCORE,
        primary=ModelProfile(
            provider="gemini",
            model="gemini-2.5-flash-lite",
            temperature=0.1,
            max_tokens=512,
            json_mode=True,
            cache_system=True,
        ),
        fallbacks=[
            ModelProfile(
                provider="groq",
                model="llama-3.1-8b-instant",
                temperature=0.1,
                max_tokens=512,
                json_mode=True,
            ),
            ModelProfile(
                provider="gemini",
                model="gemini-2.5-flash",
                temperature=0.1,
                max_tokens=512,
                json_mode=True,
            ),
        ],
    ),

    Task.TAILOR: RoutingDecision(
        task=Task.TAILOR,
        primary=ModelProfile(
            provider="gemini",
            model="gemini-2.5-flash",
            temperature=0.3,
            max_tokens=2048,
            json_mode=False,
            cache_system=True,
        ),
        fallbacks=[
            ModelProfile(
                provider="groq",
                model="llama-3.3-70b-versatile",
                temperature=0.3,
                max_tokens=2048,
                json_mode=False,
            ),
            ModelProfile(
                provider="anthropic",
                model="claude-sonnet-4-5",
                temperature=0.3,
                max_tokens=2048,
                json_mode=False,
                cache_system=True,
            ),
        ],
    ),

    Task.COVER_LETTER: RoutingDecision(
        task=Task.COVER_LETTER,
        primary=ModelProfile(
            provider="gemini",
            model="gemini-2.5-flash",
            temperature=0.7,
            max_tokens=1024,
            json_mode=False,
        ),
        fallbacks=[
            ModelProfile(
                provider="anthropic",
                model="claude-sonnet-4-5",
                temperature=0.7,
                max_tokens=1024,
                json_mode=False,
            ),
            ModelProfile(
                provider="groq",
                model="llama-3.3-70b-versatile",
                temperature=0.7,
                max_tokens=1024,
                json_mode=False,
            ),
        ],
    ),

    Task.QA_BEHAVIORAL: RoutingDecision(
        task=Task.QA_BEHAVIORAL,
        primary=ModelProfile(
            provider="gemini",
            model="gemini-2.5-flash-lite",
            temperature=0.4,
            max_tokens=768,
            json_mode=False,
        ),
        fallbacks=[
            ModelProfile(
                provider="groq",
                model="llama-3.1-8b-instant",
                temperature=0.4,
                max_tokens=768,
                json_mode=False,
            ),
        ],
    ),

    Task.FORM_FILL: RoutingDecision(
        task=Task.FORM_FILL,
        primary=ModelProfile(
            provider="groq",
            model="llama-3.1-8b-instant",
            temperature=0.0,
            max_tokens=256,
            json_mode=True,
        ),
        fallbacks=[
            ModelProfile(
                provider="gemini",
                model="gemini-2.5-flash-lite",
                temperature=0.0,
                max_tokens=256,
                json_mode=True,
            ),
        ],
    ),

    Task.EMBED: RoutingDecision(
        task=Task.EMBED,
        primary=ModelProfile(
            provider="gemini",
            model="text-embedding-004",
            temperature=0.0,
            max_tokens=0,
            json_mode=False,
        ),
        fallbacks=[],
    ),

    Task.DECIDE: RoutingDecision(
        task=Task.DECIDE,
        primary=ModelProfile(
            provider="gemini",
            model="gemini-2.5-flash-lite",
            temperature=0.1,
            max_tokens=256,
            json_mode=True,
        ),
        fallbacks=[
            ModelProfile(
                provider="groq",
                model="llama-3.1-8b-instant",
                temperature=0.1,
                max_tokens=256,
                json_mode=True,
            ),
        ],
    ),
}


class ModelRouter:
    """Resolves a Task to a RoutingDecision, with optional provider override."""

    def __init__(self, table: dict[Task, RoutingDecision] | None = None):
        self._table = table if table is not None else ROUTING_TABLE

    def resolve(self, task: Task) -> RoutingDecision:
        """Return the RoutingDecision for a task, raising KeyError if unknown."""
        decision = self._table.get(task)
        if decision is None:
            raise KeyError(f"No routing entry for task {task!r}")
        return decision

    def override_primary(self, task: Task, profile: ModelProfile) -> RoutingDecision:
        """Return a new RoutingDecision with profile as primary, existing primary
        pushed to the front of the fallback list."""
        existing = self.resolve(task)
        new_fallbacks = [existing.primary] + list(existing.fallbacks)
        return RoutingDecision(task=task, primary=profile, fallbacks=new_fallbacks)
