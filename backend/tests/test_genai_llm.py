import pytest
from unittest.mock import patch, AsyncMock
from app.genai.llm import LLMClient
from pydantic import BaseModel


class DummySchema(BaseModel):
    result: str


@pytest.mark.asyncio
async def test_llm_client_success():
    with patch("app.genai.llm.ensure_configured"), patch(
        "app.genai.llm.generate_content", new_callable=AsyncMock
    ) as mock_gen:
        mock_gen.return_value = '{"result": "success"}'
        result = await LLMClient.generate_structured("test prompt", DummySchema)
        assert result.result == "success"
        assert mock_gen.call_count == 1


def test_schema_inlines_nested_models():
    from app.genai.llm import _schema_to_json_schema
    from app.genai.schemas import StockExtractResult

    schema = _schema_to_json_schema(StockExtractResult)
    assert "$ref" not in str(schema)
    assert "$defs" not in schema
    assert schema["properties"]["rows"]["items"]["properties"]["name"]["type"] == "string"
