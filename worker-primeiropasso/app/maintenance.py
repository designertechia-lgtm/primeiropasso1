"""Crons de manutenção do worker (não-sociais).

Histórico: a publicação de posts sociais já morou aqui (`social_publisher.py`), mas era
código MORTO e incompatível — usava a Graph API do Facebook (`graph.facebook.com/{id}/media`),
que exige token de Página, enquanto o OAuth salva token da Instagram Login API; além disso
nenhum scheduler disparava `/cron/publish`. A publicação real é 100% da edge
`publish-social-posts` (pg_cron a cada 5 min). Removido em 2026-06-26 — ver
`auditorias/2026-06-26_auditoria_postagem_instagram.md`.
"""
import logging
from fastapi import APIRouter
from app.pipeline import mark_inactive_leads

logger = logging.getLogger(__name__)
router = APIRouter()


@router.post("/cron/mark-inactive")
async def cron_mark_inactive():
    """Marca leads sem mensagem há 7+ dias como inativos."""
    count = mark_inactive_leads(days=7)
    return {"marked_inactive": count}
