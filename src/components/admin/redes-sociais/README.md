# Redes Sociais — Conexão, Auditoria e Campanhas

> Estado vivo desta frente. Atualizado em **2026-06-02**.
> Cobre: conexão OAuth com a Meta, plano de auditoria de insights e planejador de campanhas.

---

## 🎯 Objetivo

Permitir que cada profissional **conecte suas redes** (Instagram/Facebook/Threads/LinkedIn), **publique** conteúdo pelo painel, e — próximas fases — **audite** suas métricas e **planeje campanhas** de crescimento com IA.

> ⚠️ Não existe "MCP da Meta". Conexão = **OAuth + Graph API**. MCP só faria sentido como camada de ferramentas para um agente de IA, não para conectar o app.

---

## ✅ O que foi feito

### Conexão OAuth (arquitetura)
- `supabase/functions/oauth-connect` → gera a URL de autorização por plataforma.
- `oauth-{meta,facebook,threads,linkedin}-callback` → trocam o `code` por token e salvam em `social_accounts`.
- `oauth-meta-refresh` (cron) → renova tokens de IG/Threads.
- Publicação: `worker-primeiropasso/app/social_publisher.py` + `supabase/functions/publish-social-posts`.
- UI: `src/components/dashboard/ConnectedAccounts.tsx` (aba "Contas Conectadas") e `PublicationCalendarTab.tsx` (Calendário).

### Correção do bug de credenciais (importante)
Cada produto da Meta exige o **App ID/segredo do seu próprio app**. Antes, um único `META_APP_ID` servia os três — só um funcionava. Agora os callbacks leem variáveis separadas com **fallback** para `META_APP_*`:

| Rede | Variável ID | Valor | Segredo |
|------|-------------|-------|---------|
| Instagram | `INSTAGRAM_APP_ID` | `1683421203787531` | `INSTAGRAM_APP_SECRET` (ou `META_APP_SECRET`) |
| Facebook | `FACEBOOK_APP_ID` | `958990950209919` | `FACEBOOK_APP_SECRET` |
| Threads | `THREADS_APP_ID` | *(pendente)* | `THREADS_APP_SECRET` *(pendente)* |

> `META_APP_ID` = ID do app do **Instagram** (`1683421203787531`). O app do **Facebook** é o `958990950209919`.

### Outros ajustes
- `supabase/config.toml`: `verify_jwt = false` para os callbacks `oauth-meta/facebook/threads/linkedin` (são chamados pelo navegador, sem JWT).
- Mensagens de erro da Meta traduzidas (`friendlyError`) nos 3 callbacks.
- **Instagram: conecta ponta a ponta ✅** (validado — erro anterior era só senha do IG).

---

## ⏳ O que está faltando

### Facebook (parou aqui)
Sequência de erros já vencidos: `INVALID_APP_ID` ✅ → `URL bloqueada` ✅ (redirect URI adicionado). **Erro atual: `Invalid Scopes`** (`pages_show_list`, `pages_read_engagement`, `pages_manage_posts`, `pages_manage_metadata`, `business_management`).
- **Causa:** o app só tem o **caso de uso do Instagram**. Falta adicionar um **caso de uso de Páginas do Facebook** + essas permissões em "Casos de uso".
- Avaliar **reduzir scopes** (ex.: `business_management` e `pages_manage_metadata` provavelmente desnecessários só pra publicar).
- Redirect URI já cadastrado no Facebook Login: `https://lpqkkbtadnqkbathdvzb.supabase.co/functions/v1/oauth-facebook-callback`.

### Threads
- Conexão ainda não testada. Falta setar `THREADS_APP_ID`/`THREADS_APP_SECRET`.
- Para **auditoria** precisa adicionar o scope `threads_manage_insights` em `oauth-connect` (hoje só pede `threads_basic`, `threads_content_publish`, `threads_manage_replies`, `threads_read_replies`) → exige re-conexão.

### Publicação do app na Meta (bloqueador principal)
O app `PrimeiroPassoAuthRedesSociais` está em **modo Desenvolvimento (não publicado)**. Hoje **só contas testadoras conectam**. Para usuário leigo conectar sozinho:
1. Verificação do Negócio / "Tornar-se Provedor de Tecnologia".
2. **App Review** das permissões (Acesso Avançado) — screencast + justificativas.
3. Publicar (modo Live).

---

## 📋 Plano: Auditoria + Campanhas (próximas fases)

> **⚡ NOVO (10/06):** campanhas **PAGAS (Google Ads + Meta Ads)** viraram prioridade da cliente
> e têm plano próprio em `_docs/PLANO_AXEL_CAMPANHAS_GOOGLE_ADS.md` — Axel estrategista, MCC com
> sub-contas individuais, mídia no cartão do PROFISSIONAL direto no Google (créditos pagam só a
> geração IA), **página DEDICADA `/admin/trafego-pago`** (fora desta tela), relatórios com funil
> completo anúncio→lead→agendamento. A Fase 3 abaixo (planejador de campanha ORGÂNICA/calendário)
> continua válida e é complementar — não confundir as duas.

| Fase | Entrega | Peça técnica |
|------|---------|--------------|
| 0 · Fundação | Histórico real de métricas | Tabela `social_insights_snapshots` + cron diário |
| 1 · Auditoria IG (MVP) | Aba "Auditoria": seguidores, alcance, top posts, melhores horários/formatos + diagnóstico IA | Edge fn `social-insights` (token → Graph API → normaliza) |
| 2 · Facebook + Threads | Auditoria nas 3 redes | Estende a fn; add scope `threads_manage_insights`; FB talvez `read_insights` |
| 3 · Planejador de Campanha | Gera calendário (objetivo+período+cadência), aprova → vira vídeo no Estúdio Viral → agenda | Tabela `campaigns`/`campaign_items` (ou `social_posts` status `ideia` + `campaign_id`) |
| 4 · Loop de otimização | Insights realimentam sugestões + relatório | Liga auditoria ↔ planner |

**Ordem sugerida:** Fase 0+1 → 3 → 2 → 4. Tudo depende do App Review para liberar aos usuários finais.

> Detalhe do calendário: hoje só agenda **conteúdo já existente** (exige `video_id`/`article_id`). Para a campanha aparecer inteira como rascunho, criar slot "ideia" sem conteúdo (Fase 3).

---

## 🛠️ Deploy das edge functions

CLI do Supabase não está instalado global — usar via `npx` (não precisa Docker):

```powershell
$env:SUPABASE_ACCESS_TOKEN = "<token-pessoal-supabase>"
npx -y supabase functions deploy <nome-da-function> --project-ref lpqkkbtadnqkbathdvzb
```

- `project-ref` = `lpqkkbtadnqkbathdvzb`.
- Secrets (env das functions): **Supabase → Edge Functions → Secrets** (NÃO no `.env`, que só serve pras `VITE_` do front).
- Mudança de secret normalmente propaga sem redeploy; em dúvida, redeploy a function.

---

## 🔑 Secrets relevantes (Supabase)

`META_APP_ID`, `META_APP_SECRET`, `INSTAGRAM_APP_ID`, `FACEBOOK_APP_ID`, `FACEBOOK_APP_SECRET`, `LINKEDIN_CLIENT_ID` (+ `*_SECRET`).
Pendentes: `THREADS_APP_ID`, `THREADS_APP_SECRET`, possivelmente `INSTAGRAM_APP_SECRET` (hoje cai no `META_APP_SECRET`).

---

## 📂 Arquivos-chave

- Geração de URL OAuth: `supabase/functions/oauth-connect/index.ts`
- Callbacks: `supabase/functions/oauth-{meta,facebook,threads,linkedin}-callback/index.ts`
- Refresh de token: `supabase/functions/oauth-meta-refresh/index.ts`
- Config JWT das functions: `supabase/config.toml`
- UI conexão: `src/components/dashboard/ConnectedAccounts.tsx`
- Calendário: `src/components/admin/redes-sociais/PublicationCalendarTab.tsx` · `SchedulePostDialog.tsx`
- Publicação (worker): `worker-primeiropasso/app/social_publisher.py`
