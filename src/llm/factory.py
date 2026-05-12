"""
LLM system factory — singleton wiring of all components.
Call get_dispatcher() to get a ready-to-use TaskDispatcher.
"""
from __future__ import annotations
from functools import lru_cache

from .dispatcher import TaskDispatcher
from .router import ModelRouter, ROUTING_TABLE
from .cache import ResultCache
from .telemetry import TelemetryLogger
from .rate_limit import RateLimitRegistry
from .circuit_breaker import CircuitBreakerRegistry
from .providers.groq_provider import GroqProvider
from .providers.mock_provider import MockProvider


@lru_cache(maxsize=1)
def get_dispatcher(test_mode: bool = False) -> TaskDispatcher:
    """Build and return the singleton TaskDispatcher.

    Pass test_mode=True in unit tests to use MockProvider for all tasks.
    """
    from src.settings import settings
    rate_reg = RateLimitRegistry()
    breaker_reg = CircuitBreakerRegistry()

    if test_mode:
        providers = {
            "groq": MockProvider(),
            "gemini": MockProvider(),
            "anthropic": MockProvider(),
            "mock": MockProvider(),
        }
    else:
        providers = {}
        if settings.GROQ_API_KEYS:
            providers["groq"] = GroqProvider(settings.GROQ_API_KEYS, rate_reg)
        if settings.GEMINI_API_KEY:
            from .providers.gemini_provider import GeminiProvider
            providers["gemini"] = GeminiProvider(settings.GEMINI_API_KEY, rate_reg)
        if settings.ANTHROPIC_API_KEY:
            from .providers.claude_provider import ClaudeProvider
            providers["anthropic"] = ClaudeProvider(settings.ANTHROPIC_API_KEY, rate_reg)

        if not providers:
            raise RuntimeError("No LLM providers configured. Set GROQ_API_KEYS, GEMINI_API_KEY, or ANTHROPIC_API_KEY in .env")

    router = ModelRouter(ROUTING_TABLE)
    cache = ResultCache(settings.LLM_CACHE_DB)
    telemetry = TelemetryLogger(settings.LLM_TELEMETRY_LOG)

    return TaskDispatcher(
        providers,
        router=router,
        cache=cache,
        telemetry=telemetry,
        rate_limiter=rate_reg,
        circuit_breakers=breaker_reg,
    )


def reset_dispatcher():
    """Clear the singleton — used in tests."""
    get_dispatcher.cache_clear()
