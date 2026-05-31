"""
Redis-based debouncing to prevent duplicate processing of rapid messages.
Same pattern as n8n Wait node.
"""
# feature: agente-conversa — ver _docs/features/agente-conversa.md
import redis
from app.config import get_settings

_redis: redis.Redis | None = None


def get_redis() -> redis.Redis:
    global _redis
    if _redis is None:
        _redis = redis.from_url(get_settings().REDIS_URL, decode_responses=True)
    return _redis


def should_process(phone: str) -> bool:
    """Returns True if this message should be processed (not flooded)."""
    r = get_redis()
    key = f"antiflood:{phone}"
    ttl = get_settings().ANTI_FLOOD_SECONDS
    if r.exists(key):
        r.expire(key, ttl)
        return False
    r.setex(key, ttl, "1")
    return True


def mark_processing_done(phone: str) -> None:
    get_redis().delete(f"antiflood:{phone}")


# ── UNIFICACAO DE MENSAGENS (#7) ───────────────────────────────────────────
# Em vez de DESCARTAR mensagens rapidas, acumulamos num buffer e processamos
# tudo junto apos uma janela de silencio (debounce). Espelha o par
# unificar_mensagens + Wait do fluxo n8n aprovado.
_BUFFER_TTL = 120  # segundos: limpeza preventiva do buffer


def buffer_message(phone: str, text: str) -> str:
    """Adiciona a mensagem ao buffer e retorna um token sequencial.

    O token identifica a 'ultima mensagem': so a task que detiver o token mais
    recente apos a janela de debounce processa o buffer inteiro.
    """
    r = get_redis()
    r.rpush(f"msgbuf:{phone}", text)
    r.expire(f"msgbuf:{phone}", _BUFFER_TTL)
    token = r.incr(f"msgseq:{phone}")
    r.expire(f"msgseq:{phone}", _BUFFER_TTL)
    return str(token)


def is_latest(phone: str, token: str) -> bool:
    """True se `token` ainda e o mais recente (nenhuma msg nova chegou depois)."""
    return (get_redis().get(f"msgseq:{phone}") or "") == str(token)


def drain_buffer(phone: str) -> str:
    """Esvazia o buffer e devolve as mensagens unificadas em um unico texto."""
    r = get_redis()
    key = f"msgbuf:{phone}"
    msgs = r.lrange(key, 0, -1)
    r.delete(key)
    return "\n".join(m for m in msgs if m and m.strip())
