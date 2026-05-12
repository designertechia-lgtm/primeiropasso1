# 📋 Levantamento de Funcionalidades — PrimeiroPasso

> **Data:** 12/05/2026  
> **Fonte:** `_antig/` (5 arquivos) + `_docs/` (7 arquivos) + `PLANO_DESENVOLVIMENTO.md`  
> **Objetivo:** Mapear tudo que precisa de correção de bug, melhoria ou implementação pendente

---

## 📊 Resumo Executivo

| Categoria | Total de itens | 🔴 Crítico | 🟡 Importante | 🟢 Melhoria | ✅ Concluído |
|-----------|:-:|:-:|:-:|:-:|:-:|
| **Landing Page / UI** | 5 | 0 | 1 | 2 | 2 |
| **Admin Gerente (Proprietário)** | 8 | 0 | 1 | 1 | 6 |
| **Agenda / Agendamentos** | 5 | 1 | 2 | 0 | 2 |
| **CRM Kanban** | 6 | 0 | 4 | 2 | 0 |
| **Vídeo PRO** | 7 | 1 | 3 | 2 | 1 |
| **Monetização (Item 4)** | 5 | 0 | 3 | 1 | 1 |
| **Worker Python** | 4 | 0 | 3 | 1 | 0 |
| **Redes Sociais** | 3 | 0 | 2 | 1 | 0 |
| **Deploy / Infra** | 4 | 0 | 1 | 1 | 2 |
| **Total** | **47** | **2** | **20** | **11** | **14** |

---

## 🔴 CRÍTICOS (Bloqueiam uso — resolver PRIMEIRO)

### 1. Validação anti-double-booking na Agenda
**Fonte:** [PLANO_CORRECOES.md](file:///c:/Users/CLIENTE/projetosClaude/Daia/PrimeiroPassoProjeto/primeiropasso/_docs/PLANO_CORRECOES.md) — Item UX-1  
**Status:** ⏳ Pendente  
**Problema:** Sem constraint no banco, é possível criar 2 agendamentos no mesmo horário — tanto pela UI manual quanto pelo agente WhatsApp.

**Ações necessárias:**
- [ ] Criar constraint SQL parcial: `UNIQUE (professional_id, appointment_date, start_time) WHERE status IN ('pending', 'confirmed')`
- [ ] Frontend: verificação antes de salvar
- [ ] Agente WhatsApp (`whatsapp-agent/index.ts`): mesma validação em `handleToolCall`

**Arquivos:** `supabase/migrations/`, `whatsapp-agent/index.ts`

---

### 2. Bug no `veo_generator.py` — ignora visual_prompt
**Fonte:** [PLANO_PRO_VIDEO.md](file:///c:/Users/CLIENTE/projetosClaude/Daia/PrimeiroPassoProjeto/primeiropasso/_docs/PLANO_PRO_VIDEO.md) — Item 4.4  
**Status:** ⏳ Bug confirmado  
**Problema:** O Veo está usando `slide.get("texto")` em vez de `slide.get("visual_prompt")`, gerando cenas sem relação com o roteiro visual do Gemini.

**Correção:**
```python
# ANTES (bugado):
prompt = _slide_to_veo_prompt(slide.get("texto", ""))

# DEPOIS:
prompt = slide.get("visual_prompt") or _slide_to_veo_prompt(slide.get("texto_legenda", ""))
```

**Arquivo:** `video-api/services/veo_generator.py`

---

## 🟡 IMPORTANTES (Não bloqueiam mas precisam de atenção)

---

### A. Landing Page / UI

#### 3. Card de vídeo 16:9 estourando o container
**Fonte:** [PLANO_FINALIZACAO.md](file:///c:/Users/CLIENTE/projetosClaude/Daia/PrimeiroPassoProjeto/primeiropasso/_docs/PLANO_FINALIZACAO.md) — Item 1  
**Status:** ✅ Já Concluído  

#### 4. Dark Mode — contraste e opacidade
**Fonte:** [sessao_admin_deploy.md](file:///c:/Users/CLIENTE/projetosClaude/Daia/PrimeiroPassoProjeto/primeiropasso/_antig/sessao_admin_deploy.md)  
**Status:** ✅ Já Concluído  

#### 5. Pilha de Notas interativa (AboutSection)
**Fonte:** [sessao_redesign_premium.md](file:///c:/Users/CLIENTE/projetosClaude/Daia/PrimeiroPassoProjeto/primeiropasso/_antig/sessao_redesign_premium_2026-05-05.md)  
**Status:** ✅ Concluído — mas verificar se responsivo no mobile  
**Melhoria:** Testar UX em telas < 375px e garantir que cards não cortam texto

---

### B. Admin Gerente (Proprietário)

#### 6. Painel Admin Proprietário (`/admin-proprietario`)
**Fonte:** [plano_admin_proprietario.md](file:///c:/Users/CLIENTE/projetosClaude/Daia/PrimeiroPassoProjeto/primeiropasso/_antig/plano_admin_proprietario_2026-05-05.md)  
**Status geral:** ✅ Todas as 4 fatias concluídas

| Tab | Status |
|---|---|
| Visão Geral (KPIs, MRR, gráficos 90d) | ✅ |
| Receita (MRR mensal, funil, cohort) | ✅ |
| Usuários (volume, funil, segmentação) | ✅ |
| Engajamento (posts, vídeos, créditos) | ✅ |
| PIX & Preços (CRUD) | ✅ |
| Feedback (Kanban + NPS) | ✅ |
| Acesso (concessão/revogação super_admin) | ✅ |

**Pendente (melhoria):**
- [ ] **Update 1** — Painel de uso das ferramentas do plano gratuito (Supabase, ElevenLabs, D-ID, Groq etc.) com alertas de cota

---

### C. Agenda / Agendamentos

#### 7. Consolidar Agenda em tabs (UX-1)
**Fonte:** [PLANO_CORRECOES.md](file:///c:/Users/CLIENTE/projetosClaude/Daia/PrimeiroPassoProjeto/primeiropasso/_docs/PLANO_CORRECOES.md) — UX-1  
**Status:** ⏳ Pendente  

**O que fazer:**
- [ ] Unificar `AdminAgenda.tsx` + `AdminAgendamentos.tsx` + `AdminDisponibilidade.tsx` em tabs
- [ ] Redirects de rotas antigas → query params `?tab=`
- [ ] Remover 2 itens do sidebar
- [ ] Exibir nome do paciente no card de agendamento (JOIN leads)
- [ ] Constraint anti-double-booking (🔴 crítico acima)

**Esforço:** ~1 dia  
**Arquivos:** `AdminAgenda.tsx`, `AdminAgendamentos.tsx`, `AdminDisponibilidade.tsx`, `DashboardSidebar.tsx`, `App.tsx`

---

### D. CRM Kanban

#### 8. Kanban CRM de Clientes (Item 3a)
**Fonte:** [Kanban CRM de Clientes](file:///c:/Users/CLIENTE/projetosClaude/Daia/PrimeiroPassoProjeto/primeiropasso/_docs/Kanban%20CRM%20de%20Clientes) + [PLANO_FINALIZACAO.md](file:///c:/Users/CLIENTE/projetosClaude/Daia/PrimeiroPassoProjeto/primeiropasso/_docs/PLANO_FINALIZACAO.md) — Item 3a  
**Status:** ⏳ Pendente (componentes base existem mas funcionalidades incompletas)

> [!IMPORTANT]
> Existem 2 arquivos: `AdminClientes.tsx` (1.7KB) e `AdminClientesKanban.tsx` (2.3KB) — ambos muito pequenos, provavelmente stubs.

**Pendente:**
- [ ] Migration SQL: `pipeline_stage`, `last_message_at`, `agent_enabled`, `origin_platform` em `leads`
- [ ] Instalar `@dnd-kit/core` + `@dnd-kit/sortable`
- [ ] Hooks: `useLeadsKanban`, `useUpdateLeadStage`, `useLeadConversation`
- [ ] Componentes: `KanbanBoard`, `KanbanColumn`, `KanbanCard`, `KanbanFilters`, `LeadDetailSheet`
- [ ] 6 colunas: Lead Novo → Em Conversa → Proposta → Agendado → Cliente Ativo → Inativo
- [ ] Supabase Realtime para live updates

**Esforço:** 2-3 dias

---

#### 9. Evolution API — Conectar WhatsApp pelo CRM
**Fonte:** [PLANO_EVOLUTION_API.md](file:///c:/Users/CLIENTE/projetosClaude/Daia/PrimeiroPassoProjeto/primeiropasso/_docs/PLANO_EVOLUTION_API.md)  
**Status:** ⏳ Pendente  

**Pendente:**
- [ ] Migration: `professionals.evolution_instance_name`
- [ ] Edge Function: `evolution-proxy` (create, connect, status, logout)
- [ ] Componente: `EvolutionConnectDialog.tsx` (modal QR code)
- [ ] Hook: `useEvolutionInstance.ts`
- [ ] Secrets: `EVOLUTION_API_URL`, `EVOLUTION_API_KEY`

---

### E. Redes Sociais

#### 10. Consolidar Contas Conectadas em Redes Sociais (UX-4)
**Fonte:** [PLANO_CORRECOES.md](file:///c:/Users/CLIENTE/projetosClaude/Daia/PrimeiroPassoProjeto/primeiropasso/_docs/PLANO_CORRECOES.md) — UX-4  
**Status:** ⏳ Pendente  

> [!NOTE]
> Conversas recentes mostram que a sidebar já foi reorganizada com Redes Sociais tendo tabs (Artigos, Vídeos, Criar Vídeo, Avatares, Posts, Contas, RAG). Verificar se UX-4 já foi absorvido nessa refatoração.

- [ ] Verificar se `AdminConfiguracoes.tsx` ainda tem seção "Contas Conectadas" duplicada
- [ ] OAuth callback continua funcionando

**Esforço:** ~3 horas (se ainda pendente)

---

#### 11. `publish-social-posts` sem gatilho periódico
**Fonte:** [PLANO_CORRECOES.md](file:///c:/Users/CLIENTE/projetosClaude/Daia/PrimeiroPassoProjeto/primeiropasso/_docs/PLANO_CORRECOES.md) — 🟡 Importante  
**Status:** ⏳ Pendente  
**Problema:** Posts agendados como `scheduled` nunca são publicados porque ninguém chama a Edge Function periodicamente.

**Ação:**
- [ ] Verificar se `pg_cron` já está configurado: `SELECT * FROM cron.job;`
- [ ] Se não, criar job de 5 em 5 minutos chamando `publish-social-posts`

---

### F. Vídeo PRO

#### 12. Página `/admin/criar-video-pro`
**Fonte:** [PLANO_PRO_VIDEO.md](file:///c:/Users/CLIENTE/projetosClaude/Daia/PrimeiroPassoProjeto/primeiropasso/_docs/PLANO_PRO_VIDEO.md)  
**Status:** ⚠️ Parcial (arquivo `AdminCriarVideoPro.tsx` existe, 55KB — wizard parcialmente implementado)

**Sprint 2 — pendências:**
- [ ] Bug `veo_generator.py` (🔴 item 2 acima)
- [ ] `services/avatar_animator.py` — criar
- [ ] `services/frame_animator.py` — criar (com STYLE_MODIFIERS)
- [ ] `STYLE_MODIFIERS` + `apply_style()` em `veo_generator.py`
- [ ] `POST /preview-avatar` em `main.py`
- [ ] `POST /gerar-video-pro` em `main.py` (com fallback)

**Sprint 3 (polish):**
- [ ] Galeria de avatares persistentes (`professional_avatars`)
- [ ] Reutilizar avatar em 1 clique
- [ ] DB: `modo_visual`, `custo_estimado`, `slides_json` em `videos`

#### 13. Botão "Criar Vídeo" na página Vídeos (UX-3)
**Fonte:** [PLANO_CORRECOES.md](file:///c:/Users/CLIENTE/projetosClaude/Daia/PrimeiroPassoProjeto/primeiropasso/_docs/PLANO_CORRECOES.md) — UX-3  
**Status:** ⏳ Pendente (ou já absorvido pela refatoração do sidebar)  
**Esforço:** 30 min

---

### G. Monetização (Item 4)

#### 14. Sistema de Assinatura + Créditos
**Fonte:** [PLANO_ITEM4_MONETIZACAO.md](file:///c:/Users/CLIENTE/projetosClaude/Daia/PrimeiroPassoProjeto/primeiropasso/_docs/PLANO_ITEM4_MONETIZACAO.md) + [PLANO_FINALIZACAO.md](file:///c:/Users/CLIENTE/projetosClaude/Daia/PrimeiroPassoProjeto/primeiropasso/_docs/PLANO_FINALIZACAO.md) — Item 4  

| Fatia | Status | Detalhes |
|---|---|---|
| **Fatia 1** — Schema banco (`subscriptions`, `credit_ledger`, `pix_payments`, `service_pricing`, `credit_packs`) | ⚠️ Verificar | `AdminAssinatura.tsx` existe (18KB), schema pode já estar aplicado |
| **Fatia 2** — Hook de cobrança (`calculate-credits`, `consume-credits`) | ⏳ Pendente | Edge functions + integração em video-api e elevenlabs-proxy |
| **Fatia 3** — Página `/admin/assinatura` | ⚠️ Parcial | Arquivo existe com 18KB, verificar completude |
| **Fatia 4** — PIX via Mercado Pago (`create-pix-payment`, `mp-webhook`, `PixCheckoutModal`) | ⏳ Pendente | Secrets: `MP_ACCESS_TOKEN`, `MP_WEBHOOK_SECRET` |
| **Fatia 5** — Super-Admin (MRR, gestão profissionais) | ⚠️ Verificar | Pode ter sido absorvido pelo Admin Gerente |

**Decisões pendentes (precisam do produto):**
- [ ] Trial grátis? Quantos dias/créditos?
- [ ] Créditos expiram ao cancelar mensalidade?
- [ ] Vídeo Pexels tem limite mensal?
- [ ] Política de reembolso

---

### H. Worker Python (Item 3b)

#### 15. Migração n8n → Python
**Fonte:** [Kanban CRM](file:///c:/Users/CLIENTE/projetosClaude/Daia/PrimeiroPassoProjeto/primeiropasso/_docs/Kanban%20CRM%20de%20Clientes) + [PLANO_FINALIZACAO.md](file:///c:/Users/CLIENTE/projetosClaude/Daia/PrimeiroPassoProjeto/primeiropasso/_docs/PLANO_FINALIZACAO.md) — Item 3b  
**Status:** ⏳ Pendente (pasta `worker-primeiropasso/` existe na raiz)

**Pendente:**
- [ ] `app/main.py` — FastAPI + routers
- [ ] `app/webhook.py` — EvolutionAPI events
- [ ] `app/agent.py` — Orquestrador OpenAI (function calling)
- [ ] `app/memory.py` — Compatível com formato `n8n_chat_histories`
- [ ] `app/anti_flood.py` — Redis debouncing
- [ ] `app/pipeline.py` — State machine (transições de stage)
- [ ] `app/social_publisher.py` — Posts agendados
- [ ] `app/rag.py` — pgvector queries
- [ ] Docker + docker-compose
- [ ] Configurar webhook EvolutionAPI → `http://localhost:8000/webhook/evolution`

**Esforço:** 4-5 dias

---

### I. Deploy / Infraestrutura

#### 16. DNS: root domain vs www
**Fonte:** [sessao_resolucao_flatten.md](file:///c:/Users/CLIENTE/projetosClaude/Daia/PrimeiroPassoProjeto/primeiropasso/_antig/sessao_resolucao_flatten_2026-05-05.md) — Pendência  
**Status:** ⏳ Pendente  
**Problema:** `primeiropasso.online` (sem www) pode responder diferente de `www.primeiropasso.online` — possível config de DNS/redirect no EasyPanel.

#### 17. `git prune` pendente
**Fonte:** [sessao_resolucao_flatten.md](file:///c:/Users/CLIENTE/projetosClaude/Daia/PrimeiroPassoProjeto/primeiropasso/_antig/sessao_resolucao_flatten_2026-05-05.md)  
**Status:** ⏳ Pendente  
**Ação:** `git prune` para limpar loose objects

#### 18. Pasta nested antiga
**Fonte:** [sessao_resolucao_flatten.md](file:///c:/Users/CLIENTE/projetosClaude/Daia/PrimeiroPassoProjeto/primeiropasso/_antig/sessao_resolucao_flatten_2026-05-05.md)  
**Status:** ⏳ Verificar se já foi removida  
**Ação:** Deletar `OneDrive/Desktop/Cloude Code/CloudeN8n/Daia/SitePrimeiroPasso/primeiropasso1/` após validação

---

## 📈 Áreas de Risco a Monitorar

**Fonte:** [PLANO_CORRECOES.md](file:///c:/Users/CLIENTE/projetosClaude/Daia/PrimeiroPassoProjeto/primeiropasso/_docs/PLANO_CORRECOES.md)

| Área | Risco | Severidade |
|---|---|---|
| Webhook Mercado Pago | Duplicação de crédito | 🔴 |
| `consume-credits` | Race condition em saldo | 🔴 |
| RLS `credit_ledger` | Vazamento entre profissionais | 🔴 |
| Cron mensal | Duplicação se rodar 2x | 🟡 |
| PIX confirmação | Atraso de 5+ min | 🟡 |
| Tokens MP | Expiração silenciosa | 🟡 |
| Saldo negativo | Concorrência | 🔴 |
| Edge timeout | Vídeos >60s | 🟡 |
| Reembolsos | Chargeback MP | 🟡 |
| Migração de plano | Downgrade mid-cycle | 🟡 |

---

## 🎯 Recomendação de Prioridades

> [!TIP]
> Ordem sugerida para execução, balanceando impacto e risco:

### Fase 1 — Correções Urgentes (~1 dia)
1. 🔴 Bug `veo_generator.py` (30 min)
2. 🔴 Constraint anti-double-booking no banco (1h)
3. 🟡 `publish-social-posts` pg_cron (30 min)
4. 🟡 `git prune` + verificar pasta nested (15 min)

### Fase 2 — UX Quick Wins (~1 dia)
5. UX-3: Botão "Criar Vídeo" na página Vídeos (30 min)
6. UX-4: Verificar consolidação Contas Conectadas (1-3h)
7. UX-1: Consolidar Agenda em tabs (4-6h)

### Fase 3 — CRM Kanban (~3 dias)
8. Migration SQL pipeline_stage
9. Componentes Kanban completos
10. Evolution API connect dialog

### Fase 4 — Monetização (~5-7 dias)
11. Verificar schema existente
12. Edge functions calculate/consume-credits
13. PIX Mercado Pago
14. Banners de vencimento

### Fase 5 — Vídeo PRO Backend (~3 dias)
15. avatar_animator.py + frame_animator.py
16. Endpoints /preview-avatar e /gerar-video-pro
17. STYLE_MODIFIERS no Veo

### Fase 6 — Worker Python (~5 dias)
18. FastAPI + webhook + agent
19. Pipeline state machine
20. Docker deploy no VPS

---

## 📁 Inventário de Arquivos de Documentação

### `_antig/` (sessões de trabalho)
| Arquivo | Conteúdo |
|---|---|
| [guia_commit_manual.md](file:///c:/Users/CLIENTE/projetosClaude/Daia/PrimeiroPassoProjeto/primeiropasso/_antig/guia_commit_manual.md) | Guia de como fazer commit/push (workflow) |
| [plano_admin_proprietario.md](file:///c:/Users/CLIENTE/projetosClaude/Daia/PrimeiroPassoProjeto/primeiropasso/_antig/plano_admin_proprietario_2026-05-05.md) | Plano do painel gerente — ✅ concluído |
| [sessao_admin_deploy.md](file:///c:/Users/CLIENTE/projetosClaude/Daia/PrimeiroPassoProjeto/primeiropasso/_antig/sessao_admin_deploy.md) | Resolução de deploy EasyPanel (parte 1) |
| [sessao_redesign_premium.md](file:///c:/Users/CLIENTE/projetosClaude/Daia/PrimeiroPassoProjeto/primeiropasso/_antig/sessao_redesign_premium_2026-05-05.md) | Redesign Landing Page premium |
| [sessao_resolucao_flatten.md](file:///c:/Users/CLIENTE/projetosClaude/Daia/PrimeiroPassoProjeto/primeiropasso/_antig/sessao_resolucao_flatten_2026-05-05.md) | Resolução definitiva do flatten/deploy |

### `_docs/` (planos ativos)
| Arquivo | Conteúdo | Status geral |
|---|---|---|
| [PLANO_CORRECOES.md](file:///c:/Users/CLIENTE/projetosClaude/Daia/PrimeiroPassoProjeto/primeiropasso/_docs/PLANO_CORRECOES.md) | Bugs + reorganização UX | ⏳ Pendente |
| [PLANO_FINALIZACAO.md](file:///c:/Users/CLIENTE/projetosClaude/Daia/PrimeiroPassoProjeto/primeiropasso/_docs/PLANO_FINALIZACAO.md) | Roadmap geral (Items 1-4) | ⚠️ Parcial |
| [PLANO_EVOLUTION_API.md](file:///c:/Users/CLIENTE/projetosClaude/Daia/PrimeiroPassoProjeto/primeiropasso/_docs/PLANO_EVOLUTION_API.md) | Proxy Evolution API + dialog | ⏳ Pendente |
| [PLANO_ITEM4_MONETIZACAO.md](file:///c:/Users/CLIENTE/projetosClaude/Daia/PrimeiroPassoProjeto/primeiropasso/_docs/PLANO_ITEM4_MONETIZACAO.md) | Monetização detalhada (5 fatias) | ⏳ Pendente |
| [PLANO_PRO_VIDEO.md](file:///c:/Users/CLIENTE/projetosClaude/Daia/PrimeiroPassoProjeto/primeiropasso/_docs/PLANO_PRO_VIDEO.md) | Estúdio Vídeo PRO (4 modos) | ⚠️ Parcial |
| [Kanban CRM de Clientes](file:///c:/Users/CLIENTE/projetosClaude/Daia/PrimeiroPassoProjeto/primeiropasso/_docs/Kanban%20CRM%20de%20Clientes) | CRM + Worker Python | ⏳ Pendente |
| RAG Workflow com Vector ID.json | Workflow n8n RAG | Referência |
