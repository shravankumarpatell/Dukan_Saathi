"""GenAI module configuration — loads YAML configs and uses the app-level Gemini settings."""

import yaml
from pathlib import Path
from pydantic import BaseModel, Field

CONFIG_DIR = Path(__file__).parent.parent.parent / "config"


def load_yaml(filename: str) -> dict:
    with open(CONFIG_DIR / filename, "r", encoding="utf-8") as f:
        return yaml.safe_load(f)


class AppConfig(BaseModel):
    app_name: str
    version: str
    environment: str
    log_level: str


class ModelConfig(BaseModel):
    provider: str
    model: str
    temperature: float
    max_retries: int
    timeout_seconds: int


class RetryPolicy(BaseModel):
    wait_exponential_multiplier: float
    wait_exponential_max: float
    stop_after_attempt: int


class ModelsConfig(BaseModel):
    primary: ModelConfig
    fallback: ModelConfig
    retry_policy: RetryPolicy


class RetrievalConfig(BaseModel):
    chunk_size: int
    chunk_overlap: int
    embedding_model: str
    top_k: int
    similarity_threshold: float


class PromptConfig(BaseModel):
    system: str
    instructions: str
    constraints: list[str] = []


class Settings(BaseModel):
    app: AppConfig = Field(default_factory=lambda: AppConfig(**load_yaml("application.yaml")))
    models: ModelsConfig = Field(default_factory=lambda: ModelsConfig(**load_yaml("models.yaml")))
    retrieval: RetrievalConfig = Field(default_factory=lambda: RetrievalConfig(**load_yaml("retrieval.yaml")))
    prompt_extraction: PromptConfig = Field(default_factory=lambda: PromptConfig(**load_yaml("prompts/extraction.yaml")))
    prompt_chat: PromptConfig = Field(default_factory=lambda: PromptConfig(**load_yaml("prompts/chat.yaml")))


settings = Settings()
