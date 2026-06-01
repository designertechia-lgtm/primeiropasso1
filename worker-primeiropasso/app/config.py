from pydantic_settings import BaseSettings
from functools import lru_cache


class Settings(BaseSettings):
    SUPABASE_URL: str
    SUPABASE_SERVICE_KEY: str
    ANTHROPIC_API_KEY: str           # chat do agente (Claude)
    OPENAI_API_KEY: str              # Whisper (audio), embeddings (RAG), Vision
    EVOLUTION_API_URL: str
    EVOLUTION_API_KEY: str
    REDIS_URL: str = "redis://localhost:6379"
    ANTI_FLOOD_SECONDS: int = 3

    class Config:
        env_file = ".env"


@lru_cache
def get_settings() -> Settings:
    return Settings()
