# worker-primeiropasso

> **⚠️ ISTO É PRODUÇÃO.** Serviço `worker-primeiropasso` no EasyPanel (projeto
> `fluxo_raiz`). Mexer aqui afeta clientes reais.

## O que este serviço REALMENTE faz (verificado em 2026-06-01)

| Função | Endpoint | Status |
|---|---|---|
| **RAG (base de conhecimento)** | `POST /rag/ingest`, `POST /rag/search`, `DELETE /rag/documents/{id}` | ✅ **EM USO.** A edge `whatsapp-agent` chama `/rag/search` (via env `WORKER_RAG_URL`) pra responder dúvidas com a base do profissional. |
| **Redes sociais** | `POST /cron/publish`, `POST /cron/mark-inactive` | ✅ **EM USO.** Publica posts agendados (Instagram/LinkedIn) e marca leads inativos. Acionado por cron. |
| Saúde | `GET /health` | Healthcheck. |
| ~~WhatsApp (agente)~~ | ~~`POST /webhook/evolution`~~ | ⚠️ **ÓRFÃO — NÃO está em produção.** Quem atende o WhatsApp são as **edge functions do Supabase** (`whatsapp-webhook` → `whatsapp-agent`). A Evolution manda o webhook pra `lpqkkbtadnqkbathdvzb.supabase.co/functions/v1/whatsapp-webhook`, NÃO pra este worker. O código do agente aqui (`app/agent.py`, `app/webhook.py`, fases #1/#3/#4/#7) **não roda em produção**. |

## Quem é a produção do WhatsApp

```
WhatsApp → Evolution API
  → (webhook) supabase.co/functions/v1/whatsapp-webhook   [edge]
  → whatsapp-agent [edge, Claude+tools]  +  whatsapp-admin-agent [self-chat]
      → worker-primeiropasso /rag/search   (só busca na base de conhecimento)
```

## Infra (confirmado no EasyPanel em 2026-06-01)

- **Roda em:** EasyPanel, projeto `fluxo_raiz`, serviço `worker-primeiropasso` (porta 8080).
- **Evolution API:** `https://fluxo-raiz-evolution-api.dwuad4.easypanel.host`
  (o worker fala com ela só pra ENVIAR — ver `app/evolution_api.py`; não recebe o webhook dela).
- **Webhook da Evolution aponta para a edge `whatsapp-webhook`** (Supabase), não pro worker.

## IA / provedores

- **Embeddings (RAG):** OpenAI `text-embedding-3-small`.
- **Whisper (áudio) + Vision (imagem):** usados no código do agente órfão.
- Migração pra Claude (`claude-sonnet-4-6`) está na branch `fix/agente-conversa-fases-n8n`,
  **não** na `main`. Como o agente do worker não atende WhatsApp, essa migração não
  afeta o atendimento real (que roda nas edges).

## Variáveis de ambiente (produção, conferido no EasyPanel)

- `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`
- `OPENAI_API_KEY` (embeddings/RAG)
- `EVOLUTION_API_URL`, `EVOLUTION_API_KEY`
- `REDIS_URL`, `ANTI_FLOOD_SECONDS`
- ⚠️ **NÃO tem `ANTHROPIC_API_KEY`** em produção. A branch `fix/...` torna essa var
  obrigatória em `config.py` — **NÃO fazer merge/deploy dessa branch sem antes
  adicionar a var ou torná-la opcional**, senão o worker não sobe (derruba RAG + social).
