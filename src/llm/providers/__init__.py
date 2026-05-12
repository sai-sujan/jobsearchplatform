"""Provider exports with lazy optional SDK imports."""

__all__ = ["GroqProvider", "GeminiProvider", "ClaudeProvider", "MockProvider"]


def __getattr__(name):
    if name == "GroqProvider":
        from .groq_provider import GroqProvider
        return GroqProvider
    if name == "GeminiProvider":
        from .gemini_provider import GeminiProvider
        return GeminiProvider
    if name == "ClaudeProvider":
        from .claude_provider import ClaudeProvider
        return ClaudeProvider
    if name == "MockProvider":
        from .mock_provider import MockProvider
        return MockProvider
    raise AttributeError(f"module {__name__!r} has no attribute {name!r}")
