from __future__ import annotations
"""TaskDispatcher — the single entry-point for all LLM calls in CareerOS.

Responsibilities:
  - Look up the RoutingDecision for a Task via ModelRouter
  - Check the ResultCache; return cached result if present
  - Acquire a rate-limit token from RateLimitRegistry
  - Check CircuitBreakerRegistry; skip providers whose breaker is open
  - Call the correct BaseLLMProvider.generate() (or .embed() for EMBED)
  - On success: record circuit-breaker success, write to cache, log via TelemetryLogger
  - On retryable LLMError or transient exception: record failure, try next fallback
  - On non-retryable error or all providers exhausted: raise LLMError
"""

import json
from typing import Any

from .base import BaseLLMProvider, LLMError, LLMResponse
from .cache import ResultCache
from .circuit_breaker import CircuitBreakerRegistry
from .rate_limit import RateLimitRegistry
from .router import ModelRouter, ROUTING_TABLE
from .telemetry import TelemetryLogger
from .types import ModelProfile, RoutingDecision, Task


class TaskDispatcher:
    def __init__(
        self,
        providers: dict[str, BaseLLMProvider],
        *,
        cache: ResultCache,
        telemetry: TelemetryLogger,
        router: ModelRouter | None = None,
        rate_limiter: RateLimitRegistry | None = None,
        circuit_breakers: CircuitBreakerRegistry | None = None,
    ):
        self._providers = providers
        self._cache = cache
        self._telemetry = telemetry
        self._router = router or ModelRouter(ROUTING_TABLE)
        self._rate_limiter = rate_limiter or RateLimitRegistry()
        self._circuit_breakers = circuit_breakers or CircuitBreakerRegistry()

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    async def run(
        self,
        task: Task,
        *,
        system: str,
        user: str,
        cache_key: str | None = None,
    ) -> LLMResponse:
        """Execute a text-generation task, respecting caching and fallbacks."""
        decision = self._router.resolve(task)

        # Cache lookup — skip for tasks with TTL == 0 (handled inside ResultCache)
        if cache_key is not None:
            cached = self._cache.get(task.value, cache_key)
            if cached is not None:
                self._telemetry.log_cache_hit(task.value, cache_key)
                # Re-hydrate a minimal LLMResponse from the cached dict
                return LLMResponse(
                    text=cached["text"],
                    model=cached["model"],
                    input_tokens=cached.get("input_tokens", 0),
                    output_tokens=cached.get("output_tokens", 0),
                    latency_ms=cached.get("latency_ms", 0),
                    cached_input_tokens=cached.get("cached_input_tokens", 0),
                    finish_reason=cached.get("finish_reason", "stop"),
                )

        profiles = [decision.primary] + list(decision.fallbacks)
        last_error: Exception | None = None

        for profile in profiles:
            if self._circuit_breakers.is_open(profile.provider, profile.model):
                continue

            provider = self._providers.get(profile.provider)
            if provider is None:
                continue

            try:
                await self._rate_limiter.get(profile.provider).acquire()
                response = await provider.generate(
                    model=profile.model,
                    system=system,
                    user=user,
                    max_tokens=profile.max_tokens,
                    temperature=profile.temperature,
                    json_mode=profile.json_mode,
                    cache_system=profile.cache_system,
                )
            except LLMError as exc:
                self._circuit_breakers.get(profile.provider, profile.model).record_failure()
                self._telemetry.log_failure(task.value, profile, exc)
                last_error = exc
                if not exc.retryable:
                    raise
                continue
            except Exception as exc:
                self._circuit_breakers.get(profile.provider, profile.model).record_failure()
                self._telemetry.log_failure(task.value, profile, exc)
                last_error = exc
                continue

            self._circuit_breakers.get(profile.provider, profile.model).record_success()
            self._telemetry.log_call(task.value, profile, response)

            if cache_key is not None:
                self._cache.put(
                    task.value,
                    cache_key,
                    {
                        "text": response.text,
                        "model": response.model,
                        "input_tokens": response.input_tokens,
                        "output_tokens": response.output_tokens,
                        "latency_ms": response.latency_ms,
                        "cached_input_tokens": response.cached_input_tokens,
                        "finish_reason": response.finish_reason,
                    },
                )

            return response

        raise LLMError(
            f"All providers exhausted for task {task.value!r}",
            retryable=False,
            provider="dispatcher",
        ) from last_error

    async def embed(
        self,
        texts: list[str],
        *,
        cache_key: str | None = None,
    ) -> list[list[float]]:
        """Run the EMBED task — returns a list of float vectors, one per text."""
        decision = self._router.resolve(Task.EMBED)
        profile = decision.primary

        if cache_key is not None:
            cached = self._cache.get(Task.EMBED.value, cache_key)
            if cached is not None:
                self._telemetry.log_cache_hit(Task.EMBED.value, cache_key)
                return cached

        provider = self._providers.get(profile.provider)
        if provider is None:
            raise LLMError(
                f"No provider registered for {profile.provider!r}",
                retryable=False,
                provider=profile.provider,
            )

        if self._circuit_breakers.is_open(profile.provider, profile.model):
            raise LLMError(
                f"Circuit breaker open for {profile.provider}:{profile.model}",
                retryable=True,
                provider=profile.provider,
            )

        await self._rate_limiter.get(profile.provider).acquire()

        try:
            vectors = await provider.embed(texts, profile.model)
        except LLMError as exc:
            self._circuit_breakers.get(profile.provider, profile.model).record_failure()
            self._telemetry.log_failure(Task.EMBED.value, profile, exc)
            raise
        except Exception as exc:
            self._circuit_breakers.get(profile.provider, profile.model).record_failure()
            self._telemetry.log_failure(Task.EMBED.value, profile, exc)
            raise LLMError(str(exc), retryable=True, provider=profile.provider) from exc

        self._circuit_breakers.get(profile.provider, profile.model).record_success()

        if cache_key is not None:
            self._cache.put(Task.EMBED.value, cache_key, vectors)

        return vectors
