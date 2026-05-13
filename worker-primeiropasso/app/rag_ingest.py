"""RAG ingestion: download PDF, extract text, chunk, embed, insert into Supabase pgvector.

Substitui o workflow n8n "RAG Workflow com Vector ID" (_docs/RAG Workflow com Vector ID.json).

Paridade preservada com o n8n:
- metadata.data segue o padrão "Documento_id:{uuid}, file_url:{url}. {chunk_text}"
- chunk_size 5000 com RecursiveCharacterTextSplitter (Language.MARKDOWN)
- O trigger trg_update_professional_document_id atualiza professional_documents.rag_status='completed'
  automaticamente quando o primeiro chunk entra — não chamamos esse update aqui.

Diferença explícita:
- Embedding model: text-embedding-3-small (n8n default era ada-002).
  Mantém 1536 dimensões — schema compatível. Documentos antigos do n8n permanecem
  consultáveis, mas similaridade entre chunks antigos e novos será degradada.
  Re-ingerir docs antigos é recomendado após cutover (`POST /rag/reingest/{document_id}`).
"""
from __future__ import annotations

import io
import logging
from typing import Any

import httpx
from openai import OpenAI
from pypdf import PdfReader
from langchain_text_splitters import RecursiveCharacterTextSplitter, Language

from app.config import get_settings
from app.db import get_supabase

logger = logging.getLogger(__name__)

CHUNK_SIZE = 5000
CHUNK_OVERLAP = 0
EMBEDDING_MODEL = "text-embedding-3-small"
EMBEDDING_BATCH_SIZE = 96  # OpenAI suporta até 2048, mas 96 é seguro pra payload grande


def _download_pdf(signed_url: str, supabase_key: str) -> bytes:
    """Baixa o PDF. Tenta com Bearer primeiro (igual ao n8n); cai pra sem header se já é signed URL."""
    with httpx.Client(timeout=60.0, follow_redirects=True) as client:
        # Se o signed_url já tem token embutido (query param), o header Bearer pode causar conflito
        # em alguns endpoints — tentamos sem header primeiro.
        try:
            r = client.get(signed_url)
            if r.status_code == 200:
                return r.content
        except httpx.HTTPError:
            pass

        r = client.get(signed_url, headers={"Authorization": f"Bearer {supabase_key}"})
        r.raise_for_status()
        return r.content


def _extract_pdf_text(pdf_bytes: bytes) -> str:
    """Extrai todo o texto do PDF, página por página."""
    reader = PdfReader(io.BytesIO(pdf_bytes))
    pages = []
    for page in reader.pages:
        text = (page.extract_text() or "").strip()
        if text:
            pages.append(text)
    return "\n\n".join(pages).strip()


def _chunk_text(text: str) -> list[str]:
    """Splitter pareado ao n8n: RecursiveCharacterTextSplitter chunk_size=5000, markdown separators."""
    splitter = RecursiveCharacterTextSplitter.from_language(
        language=Language.MARKDOWN,
        chunk_size=CHUNK_SIZE,
        chunk_overlap=CHUNK_OVERLAP,
    )
    return [c.strip() for c in splitter.split_text(text) if c.strip()]


def _embed_batch(client: OpenAI, chunks: list[str]) -> list[list[float]]:
    """Embeda chunks em lotes para reduzir round-trips."""
    embeddings: list[list[float]] = []
    for i in range(0, len(chunks), EMBEDDING_BATCH_SIZE):
        batch = chunks[i : i + EMBEDDING_BATCH_SIZE]
        response = client.embeddings.create(model=EMBEDDING_MODEL, input=batch)
        embeddings.extend(item.embedding for item in response.data)
    return embeddings


def ingest_document(
    *,
    file_url: str,
    document_id: str,
    file_name: str,
    professional_id: str | None = None,
) -> dict[str, Any]:
    """Pipeline completo do RAG ingest.

    Retorna `{ status, document_id, chunks_inserted }`. O trigger do Supabase
    atualiza professional_documents.rag_status automaticamente.
    """
    settings = get_settings()
    supabase = get_supabase()

    logger.info(
        "rag_ingest_start", extra={"document_id": document_id, "file_name": file_name}
    )

    pdf_bytes = _download_pdf(file_url, settings.SUPABASE_SERVICE_KEY)
    raw_text = _extract_pdf_text(pdf_bytes)
    if not raw_text:
        raise ValueError("PDF text extraction returned empty content")

    chunks = _chunk_text(raw_text)
    if not chunks:
        raise ValueError("Chunking produced zero chunks")

    openai_client = OpenAI(api_key=settings.OPENAI_API_KEY)
    embeddings = _embed_batch(openai_client, chunks)
    if len(embeddings) != len(chunks):
        raise RuntimeError(
            f"Embedding count mismatch: {len(embeddings)} vs {len(chunks)} chunks"
        )

    rows: list[dict[str, Any]] = []
    for chunk, embedding in zip(chunks, embeddings):
        # Padrão exato do n8n — o trigger trg_update_professional_document_id depende disso.
        data_field = f"Documento_id:{document_id}, file_url:{file_url}. {chunk}"
        metadata: dict[str, Any] = {
            "data": data_field,
            "document_id": document_id,
            "file_name": file_name,
        }
        if professional_id:
            metadata["professional_id"] = professional_id
        rows.append({"content": chunk, "embedding": embedding, "metadata": metadata})

    insert_result = supabase.table("documents").insert(rows).execute()
    chunks_inserted = len(insert_result.data or [])
    logger.info(
        "rag_ingest_done",
        extra={"document_id": document_id, "chunks_inserted": chunks_inserted},
    )

    return {
        "status": "completed",
        "document_id": document_id,
        "chunks_inserted": chunks_inserted,
    }


def delete_document_chunks(document_id: str) -> int:
    """Remove todos os chunks de um documento da tabela `documents`."""
    supabase = get_supabase()
    result = (
        supabase.table("documents")
        .delete()
        .eq("metadata->>document_id", document_id)
        .execute()
    )
    return len(result.data or [])
