from __future__ import annotations

from ..base import BaseLLMProvider, LLMResponse


class MockProvider(BaseLLMProvider):
    """Deterministic provider for unit tests. Returns preset responses."""
    name = "mock"

    def __init__(self, responses: dict[str, str] | None = None):
        self._responses = responses or {}
        self._calls: list[dict] = []

    async def generate(
        self,
        *,
        model: str,
        system: str,
        user: str,
        max_tokens: int = 512,
        temperature: float = 0.2,
        json_mode: bool = False,
        stop: list[str] | None = None,
        cache_system: bool = False,
        timeout_s: float = 30.0,
    ) -> LLMResponse:
        # All generation params intentionally ignored — this is a test stub
        _ = max_tokens, temperature, json_mode, stop, cache_system, timeout_s
        key = model
        response_text = self._responses.get(key, '{"result": "mock"}')
        self._calls.append({"model": model, "system": system[:50], "user": user[:50]})
        return LLMResponse(
            text=response_text,
            model=model,
            input_tokens=len(system.split()) + len(user.split()),
            output_tokens=len(response_text.split()),
            latency_ms=5,
        )

    def cost_estimate(self, model: str, input_tokens: int, output_tokens: int,
                      cached_input_tokens: int = 0) -> float:
        _ = model, input_tokens, output_tokens, cached_input_tokens
        return 0.0

    @property
    def calls(self) -> list[dict]:
        return self._calls
