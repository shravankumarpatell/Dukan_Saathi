import pytest
from unittest.mock import patch, AsyncMock
from app.genai.llm import LLMClient
from app.genai.exceptions import FallbackError
from pydantic import BaseModel

class DummySchema(BaseModel):
    result: str

@pytest.mark.asyncio
async def test_llm_client_success():
    with patch("app.genai.llm.client.beta.chat.completions.parse", new_callable=AsyncMock) as mock_parse:
        mock_response = AsyncMock()
        mock_response.choices = [AsyncMock()]
        mock_response.choices[0].message.parsed = DummySchema(result="success")
        mock_parse.return_value = mock_response
        
        result = await LLMClient.generate_structured("test prompt", DummySchema)
        assert result.result == "success"
        assert mock_parse.call_count == 1
