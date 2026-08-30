import pytest
from app.genai.config import settings, PromptConfig
from app.genai.prompts import PromptBuilder

def test_settings_loaded():
    assert settings.app.app_name == "DukanSaathi GenAI Backend"
    assert settings.models.primary.model == "gemini-3.5-flash"
    assert settings.models.fallback.model == "gemini-3.6-flash"
    assert settings.retrieval.top_k == 5
    assert len(settings.prompt_extraction.constraints) > 0
    assert "{tile_sizes}" in settings.prompt_extraction.instructions
    assert settings.prompt_nlu.user.startswith("Command:")

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


def test_prompt_builder_formats_placeholders():
    config = PromptConfig(
        system="Extract sizes: {tile_sizes}",
        instructions="Go",
        constraints=["Be exact"],
    )
    prompt = PromptBuilder.build(config, {"tile_sizes": "2x2 ft"})
    assert "2x2 ft" in prompt
    assert "{tile_sizes}" not in prompt
    assert "TILE_SIZES:" not in prompt


def test_prompt_nlu_user_template():
    from app.genai.config import settings as genai_settings
    user = PromptBuilder.user_message(genai_settings.prompt_nlu, {"transcript": "2 box kajaria"})
    assert "2 box kajaria" in user


def test_extraction_prompt_includes_tile_sizes():
    from app.common.tile_sizes import TILE_SIZE_PROMPT
    prompt = PromptBuilder.build(settings.prompt_extraction, {"tile_sizes": TILE_SIZE_PROMPT})
    assert "2x2 ft" in prompt
    assert "12x18 in" in prompt
    assert "grand totals" in prompt.lower() or "Skip totals" in prompt
    assert "sqft" in prompt.lower()


def test_export_optimized_yaml(tmp_path):
    from eval.extraction.compile import export_optimized_yaml

    dest = tmp_path / "extraction.optimized.yaml"
    path = export_optimized_yaml("Use the boxes column for qty.", dest)
    text = path.read_text(encoding="utf-8")
    assert "Use the boxes column for qty." in text
    assert "system:" in text

