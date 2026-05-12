from __future__ import annotations

from dataclasses import dataclass


@dataclass
class ModelPricing:
    input: float          # USD per 1M input tokens
    output: float         # USD per 1M output tokens
    cached_input: float   # USD per 1M cached input tokens


COST_TABLE: dict[str, ModelPricing] = {
    "gemini-2.5-flash-lite": ModelPricing(input=0.075, output=0.30, cached_input=0.01875),
    "gemini-2.5-flash":      ModelPricing(input=0.15,  output=0.60, cached_input=0.0375),
    "gemini-2.5-pro":        ModelPricing(input=1.25,  output=5.00, cached_input=0.3125),
    "text-embedding-004":    ModelPricing(input=0.00625, output=0.0, cached_input=0.0),
    "llama-3.1-8b-instant":  ModelPricing(input=0.05,  output=0.08, cached_input=0.0),
    "llama-3.3-70b-versatile": ModelPricing(input=0.59, output=0.79, cached_input=0.0),
    "claude-sonnet-4-5":     ModelPricing(input=3.0,   output=15.0, cached_input=0.30),
    "claude-opus-4-7":       ModelPricing(input=15.0,  output=75.0, cached_input=1.50),
}


def estimate_cost(
    model: str,
    input_tokens: int,
    output_tokens: int,
    cached_input_tokens: int = 0,
) -> float:
    """Return estimated cost in USD for a single LLM call.

    If the model is not in COST_TABLE, returns 0.0 rather than raising.
    Pricing is per 1M tokens; token counts are divided accordingly.
    """
    pricing = COST_TABLE.get(model)
    if pricing is None:
        return 0.0

    # Cached tokens replace a portion of normal input tokens; only the
    # non-cached portion is billed at the full input rate.
    non_cached_input = max(0, input_tokens - cached_input_tokens)

    cost = (
        non_cached_input    * pricing.input        / 1_000_000
        + cached_input_tokens * pricing.cached_input / 1_000_000
        + output_tokens       * pricing.output       / 1_000_000
    )
    return cost
