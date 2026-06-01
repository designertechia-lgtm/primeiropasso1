# whatsapp-webhook / whatsapp-agent / whatsapp-admin-agent — ✅ PRODUÇÃO

> **ESTAS edge functions ATENDEM O WHATSAPP em produção.** Verificado em 2026-06-01:
> a Evolution API manda o webhook `MESSAGES_UPSERT` para
> `https://lpqkkbtadnqkbathdvzb.supabase.co/functions/v1/whatsapp-webhook`.

## Fluxo real

```
WhatsApp → Evolution API
  → (webhook) whatsapp-webhook   [recebe, roteia]
      ├─ self-chat (fromMe=true) → whatsapp-admin-agent  (profissional fala consigo)
      └─ lead                    → whatsapp-agent          (Claude + tools)
                                      → worker-primeiropasso /rag/search
                                        (busca na base de conhecimento do profissional)
```

## Papéis

| Função | Papel |
|---|---|
| `whatsapp-webhook` | Recebe o evento da Evolution e roteia (lead vs self-chat). |
| `whatsapp-agent` | Agente do lead — Claude (`claude-sonnet-4-6`) + tools (agenda, RAG, botões). |
| `whatsapp-admin-agent` | Agente "profissional fala consigo" (`fromMe=true`): ver agenda etc. |

## Relação com outros serviços

- **`evolution-proxy`** (edge): cria/conecta instância + QR code no painel CRM, e
  **configura o webhook da Evolution apontando pra este `whatsapp-webhook`**. Mantida.
- **`worker-primeiropasso`** (EasyPanel): NÃO atende WhatsApp. É consultado pelo
  `whatsapp-agent` só pra `/rag/search`, e roda os crons de redes sociais.

## ⚠️ Histórico de confusão (não repetir)

Houve uma reimplementação paralela do agente WhatsApp no `worker-primeiropasso`
(`app/agent.py`, `app/webhook.py`). Ela **não está em produção** — o webhook da
Evolution aponta pra cá, não pro worker. Antes de migrar o WhatsApp pro worker,
seria preciso mudar a URL do webhook no `evolution-proxy`.
