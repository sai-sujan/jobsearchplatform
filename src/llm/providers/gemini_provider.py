from __future__ import annotations

import re
import time
import asyncio

import google.generativeai as genai

from ..base import BaseLLMProvider, LLMResponse, LLMError
from ..cost_table import estimate_cost


class GeminiProvider(BaseLLMProvider):
    name = "gemini"

    def __init__(self, api_key: str, rate_registry=None):
        if not api_key:
            raise ValueError("GeminiProvider requires an API key")
        genai.configure(api_key=api_key)
        self._api_key = api_key
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
        stop: list[str] | None = None,  # noqa: ARG002 — not supported by Gemini SDK
        cache_system: bool = False,     # noqa: ARG002 — Gemini uses context caching separately
        timeout_s: float = 30.0,        # noqa: ARG002 — handled by executor timeout
    ) -> LLMResponse:
        _ = stop, cache_system, timeout_s  # interface params, unused in this provider
        if self._rate_registry:
            await self._rate_registry.get("gemini").acquire()

        generation_config = genai.GenerationConfig(
            max_output_tokens=max_tokens,
            temperature=temperature,
        )
        if json_mode:
            generation_config = genai.GenerationConfig(
                max_output_tokens=max_tokens,
                temperature=temperature,
                response_mime_type="application/json",
            )

        gemini_model = genai.GenerativeModel(
            model_name=model,
            system_instruction=system,
            generation_config=generation_config,
        )

        try:
            start = time.perf_counter()
            # Gemini SDK is sync — run in executor to not block event loop
            loop = asyncio.get_event_loop()
            response = await loop.run_in_executor(
                None,
                lambda: gemini_model.generate_content(user)
            )
            latency = int((time.perf_counter() - start) * 1000)
        except Exception as e:
            err_str = str(e).lower()
            retryable = "429" in err_str or "500" in err_str or "503" in err_str
            raise LLMError(str(e), retryable=retryable, provider=self.name)

        text = response.text or ""
        if json_mode:
            # Strip any residual markdown fences
            text = re.sub(r'^```(?:json)?\s*', '', text.strip(), flags=re.MULTILINE)
            text = re.sub(r'\s*```$', '', text.strip(), flags=re.MULTILINE)

        usage = response.usage_metadata if hasattr(response, 'usage_metadata') else None
        input_tokens = getattr(usage, 'prompt_token_count', 0) or 0
        output_tokens = getattr(usage, 'candidates_token_count', 0) or 0

        return LLMResponse(
            text=text,
            model=model,
            input_tokens=input_tokens,
            output_tokens=output_tokens,
            latency_ms=latency,
            finish_reason="stop",
        )

    async def embed(self, texts: list[str], model: str = "models/text-embedding-004") -> list[list[float]]:
        if self._rate_registry:
            await self._rate_registry.get("gemini").acquire()
        loop = asyncio.get_event_loop()
        results = []
        for text in texts:
            result = await loop.run_in_executor(
                None,
                lambda t=text: genai.embed_content(model=model, content=t)
            )
            results.append(result['embedding'])
        return results

    def cost_estimate(self, model: str, input_tokens: int, output_tokens: int,
                      cached_input_tokens: int = 0) -> float:
        return estimate_cost(model, input_tokens, output_tokens, cached_input_tokens)
