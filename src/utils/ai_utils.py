import json
import random
from typing import Optional
from src.settings import settings

class AIServiceError(Exception):
    """Custom exception for AI service failures."""
    pass

def call_groq(system_prompt: str, user_prompt: str, max_tokens: int = 1200, temperature: float = 0.6) -> str:
    """Generic Groq caller with key rotation and error handling."""
    try:
        from groq import Groq
    except ImportError:
        raise AIServiceError("Groq SDK not installed")

    keys = list(settings.GROQ_API_KEYS)
    if not keys:
        raise AIServiceError("No Groq API keys configured")

    random.shuffle(keys)
    # Prefer non-versatile models for speed, fallback to heavy models
    models = [settings.GROQ_LIGHT_MODEL, settings.GROQ_MODEL]
    last_err = None

    for model in models:
        for key in keys:
            try:
                client = Groq(api_key=key)
                resp = client.chat.completions.create(
                    model=model,
                    messages=[
                        {"role": "system", "content": system_prompt},
                        {"role": "user", "content": user_prompt},
                    ],
                    temperature=temperature,
                    max_tokens=max_tokens,
                )
                return (resp.choices[0].message.content or "").strip()
            except Exception as e:
                last_err = e

    raise AIServiceError(f"AI service unavailable after attempting multiple keys/models. Last error: {last_err}")
