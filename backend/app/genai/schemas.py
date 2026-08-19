from pydantic import BaseModel, ConfigDict, Field
from typing import List, Optional


class StockExtractRow(BaseModel):
    """One product line from a supplier stock sheet."""

    model_config = ConfigDict(extra="ignore")

    name: str = Field(default="", description="Product name as written on the sheet")
    code: str = Field(default="", description="Product code or SKU if visible")
    company: str = Field(default="", description="Brand or company if visible")
    size: str = Field(default="", description="Tile size from the allowed list, or empty for sanitary")
    unit: str = Field(default="box", description='box for tiles/flooring, piece for sanitary')
    piecesPerBox: int = Field(default=1, description="Pieces in one box; 1 for sanitary")
    qty: float = Field(default=0, description="Boxes for tiles, pieces for sanitary")
    lowConfidence: bool = Field(default=False, description="True if the row is blurry or uncertain")


class StockExtractResult(BaseModel):
    model_config = ConfigDict(extra="ignore")
    rows: List[StockExtractRow] = Field(default_factory=list, description="Extracted product lines")


class NluEntities(BaseModel):
    model_config = ConfigDict(extra="ignore")
    product: Optional[str] = Field(default=None)
    qty: Optional[float] = Field(default=None)
    customer: Optional[str] = Field(default=None)
    amount: Optional[float] = Field(default=None)
    mode: Optional[str] = Field(default=None, description="cash, online, or pending")


class NluResult(BaseModel):
    model_config = ConfigDict(extra="ignore")
    intent: str = Field(
        default="unknown",
        description="sale, purchase, return, payment, stock_query, udhari_query, buyers_query, topseller_query, or unknown",
    )
    language: str = Field(default="en", description="hi or en")
    entities: NluEntities = Field(default_factory=NluEntities)


class ExtractRequest(BaseModel):
    image_base64: str = ""
    mime_type: str = ""
    base64: str = ""
    mimeType: str = ""

    def resolved_base64(self) -> str:
        return self.image_base64 or self.base64

    def resolved_mime(self) -> str:
        return self.mime_type or self.mimeType


class ExtractResponse(BaseModel):
    status: str
    data: dict
    fallback_used: bool = False


class ChatMessage(BaseModel):
    role: str
    content: str


class ChatRequest(BaseModel):
    messages: List[ChatMessage] = Field(..., min_length=1)
    systemContext: str = ""


class NluRequest(BaseModel):
    transcript: str = Field(..., min_length=1)


class ChatResponse(BaseModel):
    response: str
    retrieved_context_chunks: int
