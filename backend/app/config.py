from typing import Optional, List, Dict
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

    # OpenRouter (Nemotron VL) — chat, NLU, smart stock extract
    OPENROUTER_API_KEY: str = os.environ.get("OPENROUTER_API_KEY", "")
    OPENROUTER_MODEL: str = os.environ.get(
        "OPENROUTER_MODEL", "nvidia/nemotron-nano-12b-v2-vl:free"
    )
    OPENROUTER_SITE_URL: str = os.environ.get("OPENROUTER_SITE_URL", "https://dukansaathi.app")
    OPENROUTER_APP_NAME: str = os.environ.get("OPENROUTER_APP_NAME", "DukanSaathi")

    # CORS
    CORS_ORIGINS: list = os.environ.get(
        "CORS_ORIGINS", "http://localhost:3000"
    ).split(",")

    # Server
    LOG_LEVEL: str = os.environ.get("LOG_LEVEL", "INFO")


settings = Settings()
