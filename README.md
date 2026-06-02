# Primeiro Passo — Frontend + Edge Functions + Worker

Repositório principal da plataforma (`designertechia-lgtm/primeiropasso1`).
Contém **três coisas**: o site/painel (React), as **Edge Functions** do Supabase e o **worker Python**.

> 🗺️ Visão geral de todo o ecossistema (incluindo a `video-api`): ver [`../README.md`](../README.md).

## Stack
- **Frontend:** Vite + React + TypeScript + Tailwind + shadcn/ui · React Query · React Router.
- **Backend de dados:** Supabase (Postgres + Auth + Storage + Edge Functions).
- **IA de vídeo/avatar:** delegada à **`video-api`** (FastAPI separada) via `VITE_VIDEO_API_URL`.

## Estrutura
```
src/                      Frontend (páginas, componentes, hooks)
  pages/admin/            Painel do profissional (Agenda, CRM, Redes Sociais, Vídeos, Personagens…)
  integrations/supabase/  client.ts + types.ts (tipos do banco)
supabase/
  functions/              Edge Functions (Deno) — ver lista abaixo
  migrations/             Migrations SQL
worker-primeiropasso/     Worker Python (RAG + publicação em redes sociais)
public/                   Assets estáticos
_docs/                    Planos, features, memórias  ⚠️ GITIGNORED (local, não vai pro GitHub)
_antig/                   Código antigo (arquivo)
```

## Rodar local
```bash
npm install
npm run dev          # http://localhost:8080
npm run build        # valida tipos (o dev server não checa) — rodar 1x por sessão
```
Crie `.env.local` (ver `.env.example`):
```
VITE_SUPABASE_URL=...
VITE_SUPABASE_ANON_KEY=...
VITE_RAG_INGEST_URL=...        # worker (RAG)
VITE_VIDEO_API_URL=...         # video-api (vídeo/avatar). Dev: http://127.0.0.1:8000
```

## Deploy
**Push em `main` → EasyPanel auto-deploya** o serviço `primeiro-passo-site` (prod: `primeiropasso.online`).
Branches de feature **NÃO** sobem. Passo a passo: `_docs/_referencia/guia_commit_manual.md`.

> ⚠️ **Nunca `git add .`** (pega `.env`, logs, screenshots). Liste os arquivos. Teste local antes de commitar.

## Edge Functions (Supabase, deploy via `supabase functions deploy`)
- **WhatsApp:** `whatsapp-webhook` → `whatsapp-agent` (atendimento/funil) e `whatsapp-admin-agent`; `evolution-proxy` (instância/QR).
- **Social/OAuth:** `oauth-connect`, `oauth-{meta,facebook,linkedin,threads}-callback`, `oauth-meta-refresh`, `publish-social-posts`.
- **Pagamentos:** `approve-payment-proof`, `reject-payment-proof`.
- **Automação/cron:** `run-automations`, `send-appointment-reminder`, `send-renewal-reminder`, `run-feedback-audit`.
- **Util:** `ensure-professional`, `generate-text`, `elevenlabs-proxy`, `debug-db`.

## worker-primeiropasso (Python)
Sobe no EasyPanel (projeto `fluxo_raiz`), **deploy MANUAL**. Faz só:
- **RAG** (`/rag/search`, consultado pelas edges) e **redes sociais** (`/cron/publish`).
- ⚠️ `app/agent.py` e `app/webhook.py` são **órfãos** (o WhatsApp roda nas edges, não aqui).

## 3 fontes de cor (independentes)
- `src/index.css` `:root` → landing oficial `/`
- `.theme-admin` → painel admin/CRM
- `professionals.primary_color` (banco) → páginas de profissional `/:slug`

## Galhos secos
- `_antig/` → código antigo (arquivo).
- `worker-primeiropasso/fluxomodelo_update/`, `__pycache__/` → conferir/ignorar.
