from __future__ import annotations

import json
import time
from pathlib import Path


class TelemetryLogger:
    def __init__(self, log_path: str | Path):
        self._log_path = Path(log_path)
        self._log_path.parent.mkdir(parents=True, exist_ok=True)

    def _write(self, record: dict) -> None:
        with open(self._log_path, "a") as f:
            f.write(json.dumps(record) + "\n")

    def log_call(self, task: str, profile, response, *, cached: bool = False) -> None:
        from .cost_table import estimate_cost

        cost = estimate_cost(
            profile.model,
            response.input_tokens,
            response.output_tokens,
            response.cached_input_tokens,
        )
        self._write({
            "ts":                   time.time(),
            "event":                "llm_call",
            "task":                 task,
            "provider":             profile.provider,
            "model":                profile.model,
            "input_tokens":         response.input_tokens,
            "output_tokens":        response.output_tokens,
            "cached_input_tokens":  response.cached_input_tokens,
            "latency_ms":           response.latency_ms,
            "cost_usd":             round(cost, 6),
            "cached_result":        cached,
            "finish_reason":        response.finish_reason,
        })

    def log_cache_hit(self, task: str, key: str) -> None:
        self._write({
            "ts":       time.time(),
            "event":    "cache_hit",
            "task":     task,
            "key_hash": key[:8],
        })

    def log_failure(self, task: str, profile, error: Exception) -> None:
        self._write({
            "ts":        time.time(),
            "event":     "llm_failure",
            "task":      task,
            "provider":  profile.provider,
            "model":     profile.model,
            "error":     str(error),
            "retryable": getattr(error, "retryable", False),
        })
