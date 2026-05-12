# Plano — Página `/admin-proprietario` (Painel do Dono do SaaS)

> Solicitado em 2026-05-05 por designertech.ia@gmail.com
> Visível apenas para o dono e usuários explicitamente liberados

## 1. Acesso (a primeira coisa a resolver) (✅ Concluído)

**Decisão**: usar o campo `professionals.role = 'super_admin'` que já existe + tabela nova `super_admin_access` para liberar terceiros sem promovê-los a super_admin.

```
super_admin_access (
  user_id uuid PK references auth.users,
  granted_by uuid references auth.users,
  granted_at timestamptz,
  scopes text[]   -- ['view','pix_settings','feedback','users']
  revoked_at timestamptz null
)
```

- `useAuth` ganha helper `isOwner()` que retorna true se `email === 'designertech.ia@gmail.com'` **ou** `role === 'super_admin'` **ou** existe linha em `super_admin_access` (não revoked).
- `OwnerRoute` wrapper (similar ao `AdminRoute`) bloqueia tudo em `/admin-proprietario/*`.
- **RLS**: cada query do painel passa por uma function SQL `is_super_admin()` que verifica os 3 critérios — assim mesmo que o front vaze, o banco protege.
- Item no sidebar **só aparece** se `isOwner()` (não polui o menu dos terapeutas).

**Tradeoff**: ter tanto `role='super_admin'` quanto `super_admin_access` parece duplicado. A vantagem é que `super_admin_access` é granular (scopes) e revogável sem mexer no role. Se quiser simplificar, dropamos a tabela e usamos só `role` — mas aí não dá pra dar acesso só de leitura a um sócio/contador.

## 2. Estrutura da página (Tabs, padrão já adotado) (✅ Concluído)

Rota: `/admin-proprietario?tab=X` — segue exatamente o padrão consolidado de Agenda/CRM/Redes Sociais.

| Tab | Slug | Foco |
|---|---|---|
| **Visão Geral** | `?tab=overview` | KPIs do mês + alertas |
| **Receita** | `?tab=receita` | Assinaturas, churn, atraso |
| **Usuários** | `?tab=usuarios` | Volume, ativação, perfil |
| **Engajamento** | `?tab=engajamento` | O que usam de fato |
| **PIX & Preços** | `?tab=pix` | Configurar chave, planos, packs |
| **Feedback** | `?tab=feedback` | Sugestões e reclamações |
| **Acesso** | `?tab=acesso` | Liberar/revogar super_admins |

## 3. O que vai em cada tab (✅ Concluído)

### Visão Geral
- 4 KPIs no topo: **MRR** atual, **Assinantes ativos**, **Churn 30d**, **Inadimplência hoje**
- Variação % vs período anterior em cada card
- Mini-gráfico de receita últimos 90 dias
- Lista "Precisa de atenção": pagamentos vencidos > 5 dias, comprovantes pendentes de aprovação, sugestões não lidas

### Receita
- **Gráfico 1**: MRR mensal (linha, 12 meses)
- **Gráfico 2**: Funil do mês — Pagos / Atrasados / Vencidos / Cancelados (barras empilhadas)
- **Gráfico 3**: Cohort de retenção — % que continua ativo no mês 1, 2, 3, 6 (heatmap)
- **Tabela**: assinantes em atraso (nome, dias, valor, último contato, botão "Notificar via WhatsApp")
- Filtro de período no topo (30d / 90d / 12m / custom)

### Usuários
- **Volume**: cadastros por dia/semana/mês (linha), trial vs pago
- **Funil de ativação**: Cadastrou → Completou perfil → Publicou primeiro post → Recebeu primeiro lead → Assinou pago
- **Estilo de uso** (segmentação): heavy users, médio, dormentes (>30d sem login). Pizza + lista exportável.
- **Distribuição geográfica**: top 10 estados (barras)

### Engajamento
- Posts publicados/semana
- Vídeos gerados/semana
- Carrosséis vs Reels vs Feed (pizza)
- Créditos consumidos por feature
- Tempo médio entre cadastro e primeira ação
- Top 10 usuários mais ativos (drill-down)

### PIX & Preços
- Form de `pix_settings` (chave, tipo, beneficiário, banco, instruções)
- CRUD de `credit_packs`
- CRUD de `service_pricing`
- Histórico de mudanças (audit log)

### Feedback
- Nova tabela `feedback` (tipo, status, severidade, autor, mensagem, screenshot opcional)
- Painel Kanban (4 colunas por status) ou tabela com filtros
- Modal pra responder direto via WhatsApp/email do usuário
- Coleta: botão flutuante "💬 Feedback" em todas telas admin
- Métrica no topo: NPS estimado

### Acesso
- Tabela: quem tem acesso, scopes, quem concedeu, quando, botão Revogar
- Form pra adicionar: email + checkboxes de scopes
- Audit log de cada concessão/revogação

## 4. Sugestões fortes (não pediu mas vai salvar) (✅ Concluído)

1. **Audit log** de toda mudança em pix_settings, preços, aprovação de pagamento
2. **Banner global controlável** — `app_announcements` (mensagem, tipo, ativo, data_fim)
3. **Kill switch de features** — `feature_flags` (key, enabled, percent_rollout)
4. **Export CSV** em todas tabelas
5. **Card "Saúde do sistema"** — status do video-api, último cron, taxa de erro

## 5. Stack (✅ Concluído)

- **Gráficos**: `recharts`
- **Queries**: `src/hooks/useOwnerStats.ts` — agrega via SQL, views materializadas
- **Performance**: views `v_owner_mrr_monthly`, `v_owner_churn_cohort`, `v_owner_active_users`, refresh diário via pg_cron
- **Realtime opcional**: feedback novo → toast no painel via Supabase Realtime

## 6. Fatias entregáveis (✅ Concluído)

**Fatia 1 — Fundação de acesso** (✅ Concluído)
- Tabela `super_admin_access`, function `is_super_admin()`, RLS
- `OwnerRoute`, item condicional no sidebar
- Página `/admin-proprietario` com layout de tabs vazio
- *Aceite*: dono vê a página; terapeuta comum não vê nem o menu

**Fatia 2 — Receita + PIX** (✅ Concluído)
- Views SQL de MRR, churn, atraso
- Tab Receita com 3 gráficos
- Tab PIX & Preços (CRUD)

**Fatia 3 — Usuários + Engajamento** (✅ Concluído)
- Funil de ativação, segmentação, top users
- Componentes: UsuariosTab.tsx e EngajamentoTab.tsx
- Conectados ao AdminGerente.tsx e as RPCs no Supabase

**Fatia 4 — Feedback + Acesso + Polish** (✅ Concluído — 2026-05-06)
- Tabela `feedbacks`, botão flutuante de coleta com NPS
- Tab Feedback: KPIs, filtros por status, export CSV, contato WhatsApp/email
- Tab Acesso: concessão/revogação de super_admin por e-mail com scopes
- Feature Flags: toggles em tempo real
- AppAnnouncements: banner global controlável
- Fix tipos Supabase + fix join inválido em useOwnerAccessList

## Workflow acordado

- Ao final de cada fatia: testar em localhost (porta 8080)
- Estando OK: usuário aprova → eu commito + push → EasyPanel deploya `main` automaticamente

---

## Updates Futuros

> Lista de melhorias a implementar nas próximas sessões. Cada item vira uma fatia quando priorizado.

### Update 1 — Painel de uso das ferramentas do plano gratuito
Adicionar na tab **Visão Geral** (ou tab própria) um painel que monitora o consumo das ferramentas com limites no plano gratuito das plataformas integradas (Supabase, ElevenLabs, D-ID, Groq, etc.), com alertas visuais quando o crédito/quota estiver próximo do limite — para nunca deixar o serviço cair por falta de cota.
