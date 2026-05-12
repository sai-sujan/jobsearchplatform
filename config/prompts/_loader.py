from __future__ import annotations
import yaml
from pathlib import Path
from dataclasses import dataclass
from pydantic import BaseModel
from typing import Any, Dict, Optional, Type
from ._schema import SCHEMAS

@dataclass
class RenderedPrompt:
    system: str
    user: str
    schema: Optional[Type[BaseModel]]

    def parse(self, text: str) -> Any:
        if self.schema is None:
            return text.strip()
        import json, re
        # strip markdown fences if present
        cleaned = re.sub(r"^```(?:json)?\s*|\s*```$", "", text.strip(), flags=re.MULTILINE)
        return self.schema.model_validate_json(cleaned)

class PromptRegistry:
    def __init__(self, root: Optional[Path] = None):
        if root is None:
            root = Path(__file__).parent
        self._root = root
        self._cache: Dict[str, dict] = {}

    def _load(self, prompt_id: str) -> dict:
        if prompt_id not in self._cache:
            candidates = list(self._root.glob(f"{prompt_id}*.yaml"))
            if not candidates:
                raise FileNotFoundError(f"No prompt file matching '{prompt_id}*.yaml' in {self._root}")
            # pick highest version (lexicographic sort works for vN suffix)
            spec_path = sorted(candidates)[-1]
            self._cache[prompt_id] = yaml.safe_load(spec_path.read_text())
        return self._cache[prompt_id]

    def render(self, prompt_id: str, variables: dict) -> RenderedPrompt:
        spec = self._load(prompt_id)
        declared = set(spec.get("input_vars", []))
        missing = declared - variables.keys()
        if missing:
            raise ValueError(f"Missing vars for prompt '{prompt_id}': {missing}")
        # Safe format — only replace declared vars
        system = spec["system"]
        user_tmpl = spec["user"]
        for k, v in variables.items():
            system = system.replace("{" + k + "}", str(v))
            user_tmpl = user_tmpl.replace("{" + k + "}", str(v))
        schema_name = spec.get("output_schema")
        schema = SCHEMAS.get(schema_name) if schema_name else None
        return RenderedPrompt(system=system, user=user_tmpl, schema=schema)

# Singleton
_registry: Optional[PromptRegistry] = None

def get_registry() -> PromptRegistry:
    global _registry
    if _registry is None:
        _registry = PromptRegistry(Path(__file__).parent)
    return _registry
