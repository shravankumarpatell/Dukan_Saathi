import pytest
from unittest.mock import AsyncMock, patch
from pydantic import BaseModel

from app.genai.llm import LLMClient
from app.ai.openrouter import parse_json_payload, request_payload, vision_content_parts


class DummySchema(BaseModel):
    result: str


def test_parse_json_payload_strips_fences():
    assert parse_json_payload('```json\n{"a": 1}\n```') == {"a": 1}
    assert parse_json_payload('noise [{"name": "x"}] trailing') == [{"name": "x"}]


def test_request_payload_blocks_paid_fallbacks():
    payload = request_payload(
        [{"role": "user", "content": "hi"}],
        temperature=0.1,
        max_tokens=16,
        extra={"model": "some-other-model", "provider": {"allow_fallbacks": True}},
    )
    assert payload["provider"]["allow_fallbacks"] is False
    assert payload["provider"]["max_price"]["prompt"] == 0
    assert payload["provider"]["max_price"]["completion"] == 0
    assert payload["provider"]["max_price"]["image"] == 0
    assert payload["reasoning"]["enabled"] is False
    assert payload["reasoning"]["exclude"] is True


def test_vision_content_parts_image_and_pdf():
    img = vision_content_parts("read this", "abc123", "image/jpg")
    assert img[1]["type"] == "image_url"
    assert img[1]["image_url"]["url"].startswith("data:image/jpeg;base64,")

    pdf = vision_content_parts("read this", "abc123", "application/pdf")
    assert pdf[1]["type"] == "file"
    assert pdf[1]["file"]["file_data"].startswith("data:application/pdf;base64,")


@pytest.mark.asyncio
async def test_llm_client_success():
    with patch("app.genai.llm.openrouter.ensure_configured"), \
         patch("app.genai.llm.openrouter.chat_complete", new_callable=AsyncMock) as mock_complete:
        mock_complete.return_value = '{"result": "success"}'
        result = await LLMClient.generate_structured("test prompt", DummySchema)
        assert result.result == "success"
        assert mock_complete.call_count >= 1
