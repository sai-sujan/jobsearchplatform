from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Any


@dataclass
class LLMResponse:
    text: str
    model: str
    input_tokens: int
    output_tokens: int
    latency_ms: int
    cached_input_tokens: int = 0
    finish_reason: str = "stop"
    raw: dict | None = None


class LLMError(Exception):
    def __init__(self, message: str, *, retryable: bool, provider: str, status: int | None = None):
        super().__init__(message)
        self.retryable = retryable
        self.provider = provider
        self.status = status


class BaseLLMProvider(ABC):
    name: str  # must be set by subclass

    @abstractmethod
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
    ) -> LLMResponse: ...

    @abstractmethod
    def cost_estimate(self, model: str, input_tokens: int, output_tokens: int, cached_input_tokens: int = 0) -> float: ...

    async def embed(self, texts: list[str], model: str) -> list[list[float]]:
        raise NotImplementedError(f"{self.__class__.__name__} does not support embeddings")
