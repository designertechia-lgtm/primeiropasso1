"""FastAPI router for RAG endpoints (ingest, search, delete).

Substitui o webhook do n8n. Endereço esperado:
- Dev local: http://localhost:8000/rag/ingest
- Prod VPS: https://<seu-host>/rag/ingest

O front-end (AdminDocumentos.tsx) lê `professional_settings.webhook_url` e faz POST
com `{ file_url, file_name, professional_id, document_id, rag_status }`.
"""
from __future__ import annotations

import logging

from fastapi import APIRouter, BackgroundTasks, HTTPException
from pydantic import BaseModel, Field

from app.rag import query_knowledge_base
from app.rag_ingest import delete_document_chunks, ingest_document

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/rag", tags=["rag"])


class IngestRequest(BaseModel):
    file_url: str
    document_id: str
    file_name: str
    professional_id: str | None = None
    # Aceito mas ignorado — payload do AdminDocumentos.tsx envia
    rag_status: str | None = None


class SearchRequest(BaseModel):
    professional_id: str
    query: str = Field(min_length=1, max_length=2000)
    match_count: int = Field(default=5, ge=1, le=20)


def _ingest_in_background(payload: IngestRequest) -> None:
    """Executa o ingest e captura exceções pra não derrubar o BackgroundTasks runner."""
    try:
        ingest_document(
            file_url=payload.file_url,
            document_id=payload.document_id,
            file_name=payload.file_name,
            professional_id=payload.professional_id,
        )
    except Exception:
        logger.exception(
            "rag_ingest_failed", extra={"document_id": payload.document_id}
        )


@router.post("/ingest")
async def ingest(payload: IngestRequest, bg: BackgroundTasks) -> dict:
    """Recebe o webhook e processa o PDF em background (responde 202 imediato)."""
    bg.add_task(_ingest_in_background, payload)
    return {"status": "accepted", "document_id": payload.document_id}


@router.post("/ingest/sync")
async def ingest_sync(payload: IngestRequest) -> dict:
    """Versão sync — usar pra debug/teste. Em produção prefira /ingest (async)."""
    try:
        return ingest_document(
            file_url=payload.file_url,
            document_id=payload.document_id,
            file_name=payload.file_name,
            professional_id=payload.professional_id,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.exception("rag_ingest_sync_failed")
        raise HTTPException(status_code=500, detail=f"Ingest failed: {e}")


@router.post("/search")
async def search(payload: SearchRequest) -> dict:
    """Busca chunks similares à query no acervo do profissional."""
    chunks = query_knowledge_base(
        professional_id=payload.professional_id,
        question=payload.query,
        match_count=payload.match_count,
    )
    return {"chunks": chunks, "count": len(chunks)}


@router.delete("/documents/{document_id}")
async def delete_document(document_id: str) -> dict:
    """Remove todos os chunks de um documento.

    O registro em `professional_documents` é deletado pelo front-end via Supabase RLS.
    """
    removed = delete_document_chunks(document_id)
    return {"removed_chunks": removed}
