from pydantic_settings import BaseSettings
from functools import lru_cache


class Settings(BaseSettings):
    SUPABASE_URL: str
    SUPABASE_SERVICE_KEY: str
    OPENAI_API_KEY: str              # embeddings (RAG) — uso real do worker em producao
    # Opcional: o worker NAO atende WhatsApp em producao (isso roda nas edge
    # functions). O agente Claude aqui (app/agent.py) e orfao. Manter opcional
    # pra um deploy sem essa var nao derrubar RAG + redes sociais.
    ANTHROPIC_API_KEY: str | None = None
    EVOLUTION_API_URL: str
    EVOLUTION_API_KEY: str
    REDIS_URL: str = "redis://localhost:6379"
    ANTI_FLOOD_SECONDS: int = 3

    class Config:
        env_file = ".env"


@lru_cache
def get_settings() -> Settings:
    return Settings()
