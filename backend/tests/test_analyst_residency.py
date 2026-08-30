"""Vertex residency defaults used by the shop analyst."""

import inspect

from app import config


def test_settings_pin_asia_south1_and_no_prompt_store():
    src = inspect.getsource(config.Settings)
    assert 'default="asia-south1"' in src or '"asia-south1"' in src
    assert "GEMINI_STORE_PROMPTS" in src
    assert config.settings.GOOGLE_CLOUD_LOCATION
    # Default in code is Mumbai; an explicit env override is allowed.
    if not __import__("os").environ.get("GOOGLE_CLOUD_LOCATION"):
        assert config.settings.GOOGLE_CLOUD_LOCATION == "asia-south1"
    if not __import__("os").environ.get("GEMINI_STORE_PROMPTS"):
        assert config.settings.GEMINI_STORE_PROMPTS is False
