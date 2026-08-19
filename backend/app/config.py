from typing import Optional, List, Dict
"""Application configuration loaded from environment variables."""

import os
from pathlib import Path
from dotenv import load_dotenv

ROOT_DIR = Path(__file__).parent.parent
load_dotenv(ROOT_DIR / ".env")
os.environ.setdefault("GOOGLE_GENAI_USE_VERTEXAI", "true")


class Settings:
    # Firebase
    FIREBASE_CREDENTIALS_PATH: str = os.environ.get(
        "FIREBASE_CREDENTIALS_PATH", str(ROOT_DIR / "firebase-service-account.json")
    )

    # Gemini on Vertex AI via Application Default Credentials (no API key).
    GOOGLE_CLOUD_PROJECT: str = os.environ.get("GOOGLE_CLOUD_PROJECT", "")
    GOOGLE_CLOUD_LOCATION: str = os.environ.get("GOOGLE_CLOUD_LOCATION", "global")
    GEMINI_MODEL: str = os.environ.get("GEMINI_MODEL", "gemini-2.5-flash")

    # CORS
    CORS_ORIGINS: list = os.environ.get(
        "CORS_ORIGINS", "http://localhost:3000"
    ).split(",")

    # Server
    LOG_LEVEL: str = os.environ.get("LOG_LEVEL", "INFO")


settings = Settings()
