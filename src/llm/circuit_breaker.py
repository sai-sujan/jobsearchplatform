from __future__ import annotations

import time
from enum import Enum


class BreakerState(Enum):
    CLOSED = "closed"
    OPEN = "open"
    HALF_OPEN = "half_open"


class CircuitBreaker:
    def __init__(self, failure_threshold: int = 3, recovery_timeout_s: float = 60.0):
        self.state = BreakerState.CLOSED
        self._failures = 0
        self._threshold = failure_threshold
        self._recovery_timeout = recovery_timeout_s
        self._opened_at: float | None = None

    def is_open(self) -> bool:
        if self.state == BreakerState.OPEN:
            if time.monotonic() - self._opened_at >= self._recovery_timeout:
                self.state = BreakerState.HALF_OPEN
                return False
            return True
        return False

    def record_success(self):
        self._failures = 0
        self.state = BreakerState.CLOSED

    def record_failure(self):
        self._failures += 1
        if self._failures >= self._threshold:
            self.state = BreakerState.OPEN
            self._opened_at = time.monotonic()


class CircuitBreakerRegistry:
    def __init__(self):
        self._breakers: dict[str, CircuitBreaker] = {}

    def get(self, provider: str, model: str) -> CircuitBreaker:
        key = f"{provider}:{model}"
        if key not in self._breakers:
            self._breakers[key] = CircuitBreaker()
        return self._breakers[key]

    def is_open(self, provider: str, model: str) -> bool:
        return self.get(provider, model).is_open()
