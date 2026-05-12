from __future__ import annotations

import asyncio
import time


class TokenBucket:
    """Async token bucket — acquire() waits until a token is available."""

    def __init__(self, rate_per_second: float, burst: int):
        self._rate = rate_per_second
        self._burst = burst
        self._tokens = float(burst)
        self._last_check = time.monotonic()
        self._lock = asyncio.Lock()

    async def acquire(self, tokens: float = 1.0) -> None:
        async with self._lock:
            now = time.monotonic()
            elapsed = now - self._last_check
            self._tokens = min(self._burst, self._tokens + elapsed * self._rate)
            self._last_check = now
            if self._tokens < tokens:
                wait = (tokens - self._tokens) / self._rate
                await asyncio.sleep(wait)
                self._tokens = 0.0
            else:
                self._tokens -= tokens


class RateLimitRegistry:
    """Per-(provider, model) token buckets."""

    _DEFAULTS = {
        "groq":      (0.5, 3),   # ~30 RPM
        "gemini":    (1.0, 5),   # ~60 RPM
        "anthropic": (0.8, 4),   # ~50 RPM
    }

    def __init__(self):
        self._buckets: dict[str, TokenBucket] = {}

    def get(self, provider: str) -> TokenBucket:
        if provider not in self._buckets:
            rate, burst = self._DEFAULTS.get(provider, (0.5, 3))
            self._buckets[provider] = TokenBucket(rate, burst)
        return self._buckets[provider]
