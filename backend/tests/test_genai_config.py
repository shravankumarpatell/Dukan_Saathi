import pytest
from app.genai.config import settings, PromptConfig
from app.genai.prompts import PromptBuilder


def test_settings_loaded():
    assert settings.app.app_name == "DukanSaathi GenAI Backend"
    assert "nemotron" in settings.models.primary.model
    assert settings.models.primary.provider == "openrouter"
    assert settings.retrieval.top_k == 5
    assert len(settings.prompt_extraction.constraints) > 0


def test_prompt_builder():
    config = PromptConfig(
        system="System",
        instructions="Instructions",
        constraints=["C1", "C2"]
    )

    prompt = PromptBuilder.build(config)
    assert "System" in prompt
    assert "Instructions" in prompt
    assert "- C1" in prompt

    context = {"Products": "Apple: $1"}
    prompt_with_context = PromptBuilder.build(config, context)
    assert "PRODUCTS:" in prompt_with_context
    assert "Apple: $1" in prompt_with_context
