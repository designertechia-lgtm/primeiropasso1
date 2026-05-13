# Worker Primeiro Passo

Worker Python (FastAPI) que substitui os workflows n8n para o projeto Primeiro Passo.

## Setup

```bash
cp .env.example .env
# Preencha as variaveis em .env

# Com Docker:
docker-compose up -d

# Sem Docker:
pip install -e .
uvicorn app.main:app --reload --port 8000
```

## Endpoints

| Metodo | Rota | Descricao |
|--------|------|-----------|
| GET | /health | Health check |
| POST | /webhook/evolution | Webhook EvolutionAPI |
| POST | /cron/publish | Publica posts sociais pendentes |
| POST | /cron/mark-inactive | Marca leads inativos (7+ dias) |
| **POST** | **/rag/ingest** | **Webhook RAG — recebe PDF, embeda e armazena (async)** |
| POST | /rag/ingest/sync | Versão sync do ingest (debug/teste) |
| POST | /rag/search | Busca chunks similares no acervo do profissional |
| DELETE | /rag/documents/{document_id} | Remove chunks de um documento |

## RAG — Migração do n8n

O endpoint `/rag/ingest` substitui o workflow n8n **"RAG Workflow com Vector ID"**
(`_docs/RAG Workflow com Vector ID.json`).

### Payload esperado (idêntico ao n8n)

```json
{
  "file_url": "https://<supabase>.co/storage/v1/object/sign/documents/...",
  "document_id": "<uuid de professional_documents.id>",
  "file_name": "ansiedade.pdf",
  "professional_id": "<uuid de professionals.id>"
}
```

### Como apontar o webhook para o worker

No painel admin (`/admin/documentos`), cada profissional configura o campo
`professional_settings.webhook_url`. Aponte para o endpoint do worker:

- **Dev local:** `http://localhost:8000/rag/ingest`
- **Prod (VPS Hostinger):** `https://<dominio-do-worker>/rag/ingest`

Você pode fazer cutover gradual: cada profissional troca a URL no painel quando
quiser. Enquanto o n8n estiver ativo, profissionais não migrados continuam
funcionando via n8n.

### Paridade com n8n (validada)

- `metadata.data` no formato `Documento_id:{uuid}, file_url:{url}. {chunk}` —
  necessário para o trigger `trg_update_professional_document_id` parsear
  e atualizar `professional_documents.rag_status='completed'`.
- Chunking: `RecursiveCharacterTextSplitter` com `chunk_size=5000` e
  separadores de Markdown (mesmo que o n8n).
- Embedding: **`text-embedding-3-small`** (1536 dims). O n8n default era
  `text-embedding-ada-002` (também 1536 dims). Schema compatível, mas
  recomenda-se re-ingerir documentos antigos após cutover para uniformizar
  o espaço vetorial. Use `POST /rag/ingest/sync` por documento ou um script
  que itere sobre `professional_documents`.

## Cron (VPS)

```
*/5 * * * * curl -sX POST http://localhost:8000/cron/publish
0 3 * * * curl -sX POST http://localhost:8000/cron/mark-inactive
```

## Testes

```bash
pip install -e ".[dev]"
pytest
```

## Variáveis de ambiente

Veja `.env.example`. Mínimo:

- `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`
- `OPENAI_API_KEY`
- `EVOLUTION_API_URL`, `EVOLUTION_API_KEY`
- `REDIS_URL` (default: `redis://localhost:6379`)
