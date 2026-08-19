import pytest
from app.gemini.client import parse_json_text, is_configured
from app.common.errors import ValidationError


def test_parse_json_text_strips_fences():
    assert parse_json_text('```json\n{"a": 1}\n```') == {"a": 1}


def test_parse_json_text_plain():
    assert parse_json_text('[{"name": "tile"}]') == [{"name": "tile"}]


def test_is_configured_reads_project(monkeypatch):
    monkeypatch.setattr("app.gemini.client.settings.GOOGLE_CLOUD_PROJECT", "")
    assert is_configured() is False
    monkeypatch.setattr("app.gemini.client.settings.GOOGLE_CLOUD_PROJECT", "demo-project")
    assert is_configured() is True


def test_ensure_configured_requires_project(monkeypatch):
    from app.gemini import client as gemini_client

    monkeypatch.setattr(gemini_client.settings, "GOOGLE_CLOUD_PROJECT", "")
    gemini_client._adc_ok = False
    with pytest.raises(ValidationError):
        gemini_client.ensure_configured()
