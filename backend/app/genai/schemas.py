from pydantic import BaseModel, Field
from typing import List, Optional

# --- Extraction Schemas ---
class ExtractedProduct(BaseModel):
    name: str = Field(description="The full name of the product or item")
    code: Optional[str] = Field(default=None, description="The product code or SKU if available")
    company: Optional[str] = Field(default=None, description="The brand or company name")
    unit: str = Field(description="The unit of measurement (e.g., box, piece, kg)")
    qty: int = Field(description="The total quantity in the specified unit")
    price_per_unit: float = Field(description="The price per unit shown on the invoice")

class InvoiceExtractionResult(BaseModel):
    supplier_name: Optional[str] = Field(default=None, description="The name of the supplier or vendor")
    invoice_number: Optional[str] = Field(default=None, description="The invoice or bill number")
    date: Optional[str] = Field(default=None, description="The date on the invoice in YYYY-MM-DD format")
    products: List[ExtractedProduct] = Field(description="The list of extracted products")
    total_amount: Optional[float] = Field(default=None, description="The total amount of the invoice")

# --- API Request/Response Schemas ---
class ExtractRequest(BaseModel):
    image_base64: str

class ExtractResponse(BaseModel):
    status: str
    data: dict
    fallback_used: bool = False

# --- Chat Schemas ---
class ChatMessage(BaseModel):
    role: str
    content: str

class ChatRequest(BaseModel):
    messages: List[ChatMessage]

class ChatResponse(BaseModel):
    response: str
    retrieved_context_chunks: int
