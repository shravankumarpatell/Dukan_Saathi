from typing import List, Optional, Dict, Any
from app.genai.config import PromptConfig

class PromptBuilder:
    @staticmethod
    def build(config: PromptConfig, context: Dict[str, Any] = None) -> str:
        context = context or {}
        
        prompt_parts = [
            config.system,
            "\n### INSTRUCTIONS ###",
            config.instructions,
            "\n### CONSTRAINTS ###"
        ]
        
        for constraint in config.constraints:
            prompt_parts.append(f"- {constraint}")
            
        if context:
            prompt_parts.append("\n### CONTEXT ###")
            for k, v in context.items():
                prompt_parts.append(f"{k.upper()}:\n{v}")
                
        return "\n".join(prompt_parts)
