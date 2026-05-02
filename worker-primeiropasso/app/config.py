from pydantic_settings import BaseSettings
from functools import lru_cache


class Settings(BaseSettings):
    SUPABASE_URL: str
    SUPABASE_SERVICE_KEY: str
    OPENAI_API_KEY: str
    EVOLUTION_API_URL: str
    EVOLUTION_API_KEY: str
    REDIS_URL: str = "redis://localhost:6379"
    ANTI_FLOOD_SECONDS: int = 3

    class Config:
        env_file = ".env"


@lru_cache
def get_settings() -> Settings:
    return Settings()
