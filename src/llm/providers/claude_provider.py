from __future__ import annotations

import re
import time
import asyncio
from typing import Any

import anthropic

from ..base import BaseLLMProvider, LLMResponse, LLMError
from ..cost_table import estimate_cost


def _extract_json(text: str) -> str:
    text = re.sub(r'^```(?:json)?\s*', '', text.strip(), flags=re.MULTILINE)
    text = re.sub(r'\s*```$', '', text.strip(), flags=re.MULTILINE)
    start = text.find('{')
    end = text.rfind('}')
    if start != -1 and end > start:
        return text[start:end+1]
    return text


class ClaudeProvider(BaseLLMProvider):
    name = "anthropic"

    def __init__(self, api_key: str, rate_registry=None):
        if not api_key:
            raise ValueError("ClaudeProvider requires an API key")
        self._client = anthropic.Anthropic(api_key=api_key)
        self._rate_registry = rate_registry

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
        timeout_s: float = 30.0,  # noqa: ARG002 — passed via httpx timeout in future
    ) -> LLMResponse:
        _ = timeout_s  # interface param; wire to httpx_client timeout when needed
        if self._rate_registry:
            await self._rate_registry.get("anthropic").acquire()

        # Prompt caching: wrap system as a block with cache_control when requested
        if cache_system:
            system_param: Any = [
                {
                    "type": "text",
                    "text": system,
                    "cache_control": {"type": "ephemeral"},
                }
            ]
        else:
            system_param = system

        # For json_mode with Claude, inject instruction into user message
        user_content = user
        if json_mode:
            user_content = user + "\n\nReturn ONLY valid JSON. No markdown fences, no explanation."

        try:
            start = time.perf_counter()
            loop = asyncio.get_event_loop()
            msg = await loop.run_in_executor(
                None,
                lambda: self._client.messages.create(
                    model=model,
                    system=system_param,
                    messages=[{"role": "user", "content": user_content}],
                    max_tokens=max_tokens,
                    temperature=temperature,
                    stop_sequences=stop or [],
                )
            )
            latency = int((time.perf_counter() - start) * 1000)
        except anthropic.APIStatusError as e:
            retryable = e.status_code in (429, 500, 502, 503)
            raise LLMError(str(e), retryable=retryable, provider=self.name, status=e.status_code)
        except Exception as e:
            raise LLMError(str(e), retryable=False, provider=self.name)

        text = "".join(b.text for b in msg.content if b.type == "text")
        if json_mode:
            text = _extract_json(text)

        usage = msg.usage
        cached_in = getattr(usage, 'cache_read_input_tokens', 0) or 0

        return LLMResponse(
            text=text,
            model=model,
            input_tokens=usage.input_tokens,
            output_tokens=usage.output_tokens,
            cached_input_tokens=cached_in,
            latency_ms=latency,
            finish_reason=msg.stop_reason or "stop",
            raw={"id": msg.id, "stop_reason": msg.stop_reason},
        )

    def cost_estimate(self, model: str, input_tokens: int, output_tokens: int,
                      cached_input_tokens: int = 0) -> float:
        return estimate_cost(model, input_tokens, output_tokens, cached_input_tokens)
