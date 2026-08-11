"""Application configuration loaded from environment variables."""

import os
from pathlib import Path
from dotenv import load_dotenv

ROOT_DIR = Path(__file__).parent.parent
load_dotenv(ROOT_DIR / ".env")


class Settings:
    # Firebase
    FIREBASE_CREDENTIALS_PATH: str = os.environ.get(
        "FIREBASE_CREDENTIALS_PATH", str(ROOT_DIR / "firebase-service-account.json")
    )

    # Gemini
    GEMINI_API_KEY: str = os.environ.get("GEMINI_API_KEY", "")
    GEMINI_MODEL: str = os.environ.get("GEMINI_MODEL", "gemini-2.0-flash")

    # CORS
    CORS_ORIGINS: list[str] = os.environ.get(
        "CORS_ORIGINS", "http://localhost:3000"
    ).split(",")

    # Server
    LOG_LEVEL: str = os.environ.get("LOG_LEVEL", "INFO")


settings = Settings()
