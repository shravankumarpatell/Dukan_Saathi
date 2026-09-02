"""Application configuration loaded from environment variables."""

import os
from pathlib import Path

from dotenv import load_dotenv

ROOT_DIR = Path(__file__).parent.parent
load_dotenv(ROOT_DIR / ".env")
os.environ.setdefault("GOOGLE_GENAI_USE_VERTEXAI", "true")


class Settings:
    DATABASE_URL: str = os.environ.get(
        "DATABASE_URL",
        "postgresql+psycopg://postgres:postgres@localhost:54322/postgres",
    )
    SUPABASE_URL: str = os.environ.get("SUPABASE_URL", "").rstrip("/")
    SUPABASE_PUBLISHABLE_KEY: str = os.environ.get("SUPABASE_PUBLISHABLE_KEY", "")
    SUPABASE_SECRET_KEY: str = os.environ.get("SUPABASE_SECRET_KEY", "")
    SUPABASE_JWKS_URL: str = os.environ.get("SUPABASE_JWKS_URL", "").rstrip("/")
    # Legacy JWT secret — only needed for local `supabase start` HS256 tokens.
    SUPABASE_JWT_SECRET: str = os.environ.get("SUPABASE_JWT_SECRET", "")
    SUPABASE_JWT_AUDIENCE: str = os.environ.get("SUPABASE_JWT_AUDIENCE", "authenticated")

    GOOGLE_CLOUD_PROJECT: str = os.environ.get("GOOGLE_CLOUD_PROJECT", "")
    # Pin Vertex to Mumbai so prompts stay in-country. Override only if you
    # have a documented reason (Assured Workloads India Data Boundary).
    GOOGLE_CLOUD_LOCATION: str = os.environ.get("GOOGLE_CLOUD_LOCATION", "asia-south1")
    GEMINI_MODEL: str = os.environ.get("GEMINI_MODEL", "gemini-3.5-flash-lite")
    # Google AI Studio key — used when Vertex ADC is not available (Oracle VM).
    GEMINI_API_KEY: str = (
        os.environ.get("GEMINI_API_KEY", "") or os.environ.get("GOOGLE_API_KEY", "")
    ).strip()
    # Never persist chat prompts/responses on Vertex (Interactions `store=false`).
    GEMINI_STORE_PROMPTS: bool = os.environ.get("GEMINI_STORE_PROMPTS", "false").lower() in (
        "1",
        "true",
        "yes",
    )
    ANALYST_DATABASE_URL: str = os.environ.get("ANALYST_DATABASE_URL", "")
    ANALYST_ROW_LIMIT: int = int(os.environ.get("ANALYST_ROW_LIMIT", "80"))
    ANALYST_STATEMENT_TIMEOUT_MS: int = int(os.environ.get("ANALYST_STATEMENT_TIMEOUT_MS", "2000"))

    CORS_ORIGINS: list = os.environ.get(
        "CORS_ORIGINS", "http://localhost:3000"
    ).split(",")

    LOG_LEVEL: str = os.environ.get("LOG_LEVEL", "INFO")

    @property
    def supabase_jwks_url(self) -> str:
        if self.SUPABASE_JWKS_URL:
            return self.SUPABASE_JWKS_URL
        if not self.SUPABASE_URL:
            return ""
        return f"{self.SUPABASE_URL}/auth/v1/.well-known/jwks.json"


settings = Settings()
