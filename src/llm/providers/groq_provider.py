from __future__ import annotations

import re
import random
import time

from groq import Groq

from ..base import BaseLLMProvider, LLMResponse, LLMError
from ..cost_table import estimate_cost

REASONING_MODELS = {"openai/gpt-oss-120b", "openai/gpt-oss-20b"}


def _extract_json(text: str) -> str:
    """Strip markdown fences and extract first {...} block."""
    text = text.strip()
    # Remove markdown fences
    text = re.sub(r'^```(?:json)?\s*', '', text, flags=re.MULTILINE)
    text = re.sub(r'\s*```$', '', text, flags=re.MULTILINE)
    # Find first { ... }
    start = text.find('{')
    end = text.rfind('}')
    if start != -1 and end > start:
        return text[start:end+1]
    return text


class GroqProvider(BaseLLMProvider):
    name = "groq"

    def __init__(self, api_keys: list[str], rate_registry=None):
        if not api_keys:
            raise ValueError("GroqProvider requires at least one API key")
        self._keys = list(api_keys)
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
        cache_system: bool = False,  # noqa: ARG002 — Groq has no prompt caching
        timeout_s: float = 30.0,
    ) -> LLMResponse:
        _ = cache_system  # interface param, unused in this provider
        if self._rate_registry:
            await self._rate_registry.get("groq").acquire()

        is_reasoning = model in REASONING_MODELS
        keys_to_try = list(self._keys)
        random.shuffle(keys_to_try)
        last_err = None

        for api_key in keys_to_try:
            try:
                client = Groq(api_key=api_key)
                kwargs = {
                    "model": model,
                    "messages": [
                        {"role": "system", "content": system},
                        {"role": "user", "content": user},
                    ],
                    "max_tokens": max_tokens,
                    "temperature": temperature,
                    "timeout": timeout_s,
                }
                if json_mode and not is_reasoning:
                    kwargs["response_format"] = {"type": "json_object"}
                if stop:
                    kwargs["stop"] = stop

                start = time.perf_counter()
                resp = client.chat.completions.create(**kwargs)
                latency = int((time.perf_counter() - start) * 1000)

                text = resp.choices[0].message.content or ""
                if json_mode and is_reasoning:
                    text = _extract_json(text)

                usage = resp.usage
                return LLMResponse(
                    text=text,
                    model=resp.model,
                    input_tokens=usage.prompt_tokens if usage else 0,
                    output_tokens=usage.completion_tokens if usage else 0,
                    latency_ms=latency,
                    finish_reason=resp.choices[0].finish_reason or "stop",
                )
            except Exception as e:
                err_str = str(e).lower()
                is_rate = "429" in err_str or "rate limit" in err_str
                is_auth = "401" in err_str or "403" in err_str
                retryable = is_rate or "500" in err_str or "502" in err_str or "503" in err_str
                last_err = LLMError(str(e), retryable=retryable, provider=self.name,
                                    status=None)
                if is_rate or is_auth:
                    continue  # rotate to next key
                raise last_err

        raise last_err or LLMError("All Groq keys exhausted", retryable=True, provider=self.name)

    def cost_estimate(self, model: str, input_tokens: int, output_tokens: int,
                      cached_input_tokens: int = 0) -> float:
        return estimate_cost(model, input_tokens, output_tokens, cached_input_tokens)
