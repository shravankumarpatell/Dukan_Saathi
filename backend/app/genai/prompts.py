from typing import List, Optional, Dict, Any
import re
from app.genai.config import PromptConfig

_PLACEHOLDER = re.compile(r"\{([a-zA-Z_][a-zA-Z0-9_]*)\}")


class _SafeMap(dict):
    def __missing__(self, key):
        return "{" + key + "}"


class PromptBuilder:
    @staticmethod
    def _placeholders(*parts: str) -> set:
        found = set()
        for part in parts:
            if part:
                found.update(_PLACEHOLDER.findall(part))
        return found

    @staticmethod
    def format_config(config: PromptConfig, context: Dict[str, Any] = None) -> PromptConfig:
        ctx = _SafeMap(context or {})
        return PromptConfig(
            system=(config.system or "").format_map(ctx),
            instructions=(config.instructions or "").format_map(ctx),
            constraints=[(c or "").format_map(ctx) for c in (config.constraints or [])],
            user=(config.user or "").format_map(ctx),
        )

    @staticmethod
    def build(config: PromptConfig, context: Dict[str, Any] = None) -> str:
        context = context or {}
        cfg = PromptBuilder.format_config(config, context)
        prompt_parts = [
            cfg.system,
            "\n### INSTRUCTIONS ###",
            cfg.instructions,
            "\n### CONSTRAINTS ###",
        ]
        for constraint in cfg.constraints:
            prompt_parts.append(f"- {constraint}")

        used = PromptBuilder._placeholders(
            config.system, config.instructions, config.user, *(config.constraints or [])
        )
        extra = {k: v for k, v in context.items() if k not in used and v}
        if extra:
            prompt_parts.append("\n### CONTEXT ###")
            for k, v in extra.items():
                prompt_parts.append(f"{k.upper()}:\n{v}")

        return "\n".join(prompt_parts)

    @staticmethod
    def user_message(config: PromptConfig, context: Dict[str, Any] = None) -> str:
        return PromptBuilder.format_config(config, context).user.strip()
