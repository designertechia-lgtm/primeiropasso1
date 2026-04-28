# Plano de Finalização — Primeiro Passo
*Atualizado em 28/04/2026 — baseado nos docs `AgenteConversaPasso01.json` e `RAG Workflow com Vector ID.json`*

---

## Contexto do que os docs revelam

Os dois arquivos n8n revelam que o projeto já tem uma **arquitetura de atendimento inteligente via WhatsApp**:

- **`AgenteConversaPasso01.json`** — Agente conversacional completo que recebe mensagens do WhatsApp via EvolutionAPI, processa texto/áudio (Whisper)/imagem (GPT-4o Vision), tem memória de conversa no PostgreSQL, anti-flood com Redis, e um orquestrador GPT-4o que atua como assistente do profissional — perfila o lead, negocia preço (promocional/mínimo/máximo), busca horários disponíveis no Supabase e cria agendamentos.
- **`RAG Workflow com Vector ID.json`** — Pipeline que recebe PDFs via webhook, extrai o texto, embeda com OpenAI e grava no Supabase Vector Store para que o agente possa consultar base de conhecimento.

Isso muda a visão do Kanban: ele não é só gestão de leads estáticos — é o **painel de controle das conversas ativas do agente de IA**.

---

## Item 1 — Bug: Card de vídeo 16:9 estourando

**Status:** Pendente

**Causa:** Em `src/components/landing/ContentSection.tsx:72`, quando `playing=true` e é vídeo nativo (`.mp4`), o componente retorna um `<div className="aspect-video">` com `<video>` dentro — mas o wrapper `<Card>` de cima não tem `overflow-hidden` aplicado consistentemente. Em `src/pages/VideosListPage.tsx:84` o problema é que o `div.aspect-video` é o contêiner estático, mas quando `playing=true` o conteúdo retornado sai desse contêiner — a altura quebra.

**Correção:** Manter o `div.aspect-video` sempre presente como wrapper fixo e renderizar player/thumbnail dentro dele, nunca trocando o wrapper. Mudança em dois arquivos, ~20 linhas.

**Arquivos afetados:**
- `src/components/landing/ContentSection.tsx` (linha 72–87)
- `src/pages/VideosListPage.tsx` (linha 84–123)

**Esforço:** 30 min | **Prioridade: Imediata**

---

## Item 2 — Autenticação de redes sociais em Configurações

**Status:** Pendente

**Onde:** Adicionar seção **"Contas Conectadas"** em `src/pages/admin/AdminConfiguracoes.tsx` — não criar página nova.

### 2a. Banco de dados
```sql
CREATE TABLE social_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  professional_id uuid REFERENCES professionals(id) ON DELETE CASCADE,
  platform text NOT NULL,          -- 'instagram' | 'linkedin' | 'tiktok'
  access_token text NOT NULL,
  refresh_token text,
  expires_at timestamptz,
  account_name text,               -- @handle ou nome do perfil
  account_id text,                 -- ID na plataforma
  page_id text,                    -- Facebook Page ID (obrigatório Instagram)
  created_at timestamptz DEFAULT now()
);
```

### 2b. OAuth — Meta (Instagram + Facebook)

Já que o app usa Supabase Auth, o fluxo Meta OAuth é adicionado como provider extra. A sequência:

1. Botão "Conectar Instagram" abre popup → `https://www.facebook.com/v21.0/dialog/oauth` com scopes: `instagram_basic`, `instagram_content_publish`, `pages_manage_posts`, `pages_read_engagement`.
2. Callback chega na Supabase Function `oauth-meta-callback` → troca code por access token → salva na tabela `social_accounts`.
3. **Requisito comunicado ao profissional no UI:** conta Instagram precisa ser Business/Creator vinculada a uma Página do Facebook.

### 2c. OAuth — LinkedIn

Mais simples: `https://www.linkedin.com/oauth/v2/authorization` com scopes `w_member_social`, `r_basicprofile`. Supabase Function `oauth-linkedin-callback`.

### 2d. UI em Configurações

Cards por plataforma mostrando:
- Status: `Conectado como @handle` (verde) ou `Não conectado` (cinza)
- Botão **Conectar** / **Desconectar**
- Data de expiração do token (com aviso se próximo de vencer)

### 2e. Worker de publicação (VPS Hostinger)

O worker Python consulta `social_posts` onde `status = 'pending' AND scheduled_at <= now()` e publica usando o token da `social_accounts` do profissional:
- Instagram: POST `/v21.0/{ig-user-id}/media` + `/{ig-user-id}/media_publish`
- LinkedIn: POST `/v2/ugcPosts`

**Esforço:** 3–4 dias | **Prioridade: Alta**

---

## Item 3 — Kanban de clientes + Migração n8n → Python

### 3a. Kanban de pipeline (baseado no fluxo real do agente)

O agente n8n já define o pipeline real. As colunas do Kanban refletem os estados da conversa:

| Coluna | Trigger de entrada | Indicador visual |
|---|---|---|
| **Lead Novo** | Primeira mensagem WhatsApp recebida | Badge amarelo |
| **Em Conversa** | Agente respondeu ≥1x | Badge azul |
| **Proposta Feita** | Agente ofereceu horário/preço | Badge roxo |
| **Agendado** | `criar_agendamento` executado | Badge verde |
| **Cliente Ativo** | ≥1 consulta realizada (status `completed`) | Badge verde escuro |
| **Inativo** | Sem mensagem há 7+ dias | Badge cinza |

**Schema adicional:**
```sql
ALTER TABLE leads ADD COLUMN pipeline_stage text DEFAULT 'novo';
ALTER TABLE leads ADD COLUMN last_message_at timestamptz;
ALTER TABLE leads ADD COLUMN agent_enabled boolean DEFAULT true;
-- pipeline_stage: 'novo' | 'em_conversa' | 'proposta' | 'agendado' | 'cliente' | 'inativo'
```

**Funcionalidades do Kanban:**
- Drag-and-drop entre colunas (usando `@dnd-kit/core`)
- Clique no card abre histórico de conversa (integrado com tabela de memória PostgreSQL)
- Toggle **Ativar/Pausar agente** por lead (espelha a tabela `desliga_fluxo` → vira `agent_enabled` no Python)
- Filtros: profissional, período, plataforma de origem
- Nova rota: `/admin/clientes`

**Esforço:** 2–3 dias

---

### 3b. Migração n8n → Python (Worker no VPS Hostinger)

O agente `AgenteConversaPasso01.json` tem todos os componentes mapeados para Python:

```
VPS Hostinger
└── worker-primeiropasso/          ← novo repositório Python
    ├── main.py                    ← FastAPI app
    ├── webhook.py                 ← recebe EvolutionAPI events
    ├── message_router.py          ← texto / áudio / imagem / botão
    ├── agent.py                   ← Orquestrador OpenAI (tools)
    ├── tools/
    │   ├── availability.py        ← buscar_horarios_disponiveis
    │   ├── appointments.py        ← criar_agendamento
    │   └── professional.py        ← verificar_disponibilidade_profissional
    ├── memory.py                  ← PostgreSQL chat memory (mesma lógica)
    ├── anti_flood.py              ← Redis queue (mesmo padrão do Wait node)
    ├── social_publisher.py        ← publica posts agendados
    ├── rag.py                     ← consulta Supabase Vector Store
    └── flow_control.py            ← desliga_fluxo / agent_enabled
```

**Integrações mantidas — sem mudança de dados:**
- Mesmo banco Supabase (tabelas `leads`, `appointments`, `availability`, `social_accounts`, `desliga_fluxo`)
- Mesma tabela de memória PostgreSQL (compatível com `memoryPostgresChat` do n8n)
- Mesmo Redis para anti-flood
- EvolutionAPI continua no VPS (só muda quem consome o webhook)

**O que muda:**
- Sem n8n cloud — zero custo de execução de workflows
- Controle total de lógica (retry, logging, alertas)
- Pode escalar horizontalmente se necessário

**Esforço:** 4–5 dias | **Prioridade: Média** *(n8n continua funcionando enquanto Python é desenvolvido em paralelo)*

---

## Item 4 — Painel de Assinaturas + Créditos de IA

**Status:** Pendente

### 4a. Modelo de custo e precificação

| Função | Custo unitário estimado |
|---|---|
| Geração de texto (Gemini Flash) | R$ 0,02–0,05 por geração |
| TTS ElevenLabs | R$ 0,01 por 1.000 chars |
| Vídeo Kling AI (premium) | R$ 0,80–2,50 por vídeo |
| Vídeo Google Veo (pro) | R$ 1,50–5,00 por vídeo |
| Agente WhatsApp por mensagem | R$ 0,01–0,03 por turn (OpenAI) |
| Storage Supabase | R$ 0,10/GB/mês |

**Estrutura de planos sugerida:**

| Plano | Preço/mês | Inclui |
|---|---|---|
| **Starter** | R$ 97 | Landing, agenda, artigos, agente WhatsApp (200 msgs/mês) |
| **Pro** | R$ 197 | Tudo do Starter + 10 créditos vídeo premium/mês |
| **Scale** | R$ 397 | Tudo do Pro + 30 créditos + avatares + prioridade |

**Créditos avulsos:** Pacotes de R$ 29 (10 créditos), R$ 79 (30 créditos), R$ 149 (70 créditos).

### 4b. Schema de banco
```sql
CREATE TABLE subscription_plans (
  id text PRIMARY KEY,  -- 'starter' | 'pro' | 'scale'
  name text, price_brl numeric,
  monthly_agent_messages int,
  monthly_video_credits int,
  features jsonb
);

CREATE TABLE subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  professional_id uuid REFERENCES professionals(id),
  plan_id text REFERENCES subscription_plans(id),
  status text DEFAULT 'active',  -- 'active' | 'cancelled' | 'past_due'
  current_period_start timestamptz,
  current_period_end timestamptz,
  mp_subscription_id text  -- ID Mercado Pago
);

CREATE TABLE credit_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  professional_id uuid REFERENCES professionals(id),
  amount int NOT NULL,   -- positivo = adicionado, negativo = consumido
  type text NOT NULL,    -- 'purchase' | 'usage' | 'bonus' | 'plan_monthly'
  description text,
  reference_id text,     -- ID do vídeo gerado, pagamento, etc.
  created_at timestamptz DEFAULT now()
);

CREATE VIEW credit_balance AS
  SELECT professional_id, SUM(amount) AS balance
  FROM credit_ledger GROUP BY professional_id;
```

### 4c. Painel do profissional

Rota `/admin/assinatura`:
- Card do plano atual com barra de uso (mensagens do agente, créditos de vídeo)
- Saldo de créditos avulsos
- Histórico de uso (tabela `credit_ledger`)
- Botão "Comprar créditos" → gera link de pagamento Mercado Pago PIX/cartão
- Botão "Mudar plano"

### 4d. Painel Super-Admin

Rota `/super-admin` (role `admin`):
- Tabela de todos os profissionais: plano, saldo de créditos, uso este mês, status
- Ações: adicionar créditos, mudar plano, suspender, resetar senha
- Gráfico de MRR e uso de IA por período
- Alertas de contas com saldo negativo

### 4e. Integração Mercado Pago

Supabase Function `create-payment`:
- Cria preferência de pagamento via MP API
- Retorna link de checkout (PIX ou cartão)
- Webhook `mp-webhook` confirma pagamento → insere na `credit_ledger`

**Esforço:** 5–7 dias | **Prioridade: Alta** *(desbloqueia monetização)*

---

## Sequência de execução recomendada

```
Semana 1
├── [Dia 1]    Item 1 — Corrigir bug cards de vídeo (30 min)
├── [Dia 1-2]  Item 2 — OAuth Meta + LinkedIn em Configurações
└── [Dia 3-5]  Item 4a–4d — Schema + painel assinaturas/créditos (sem pagamento ainda)

Semana 2
├── [Dia 1-3]  Item 3a — Kanban de clientes com drag-and-drop
├── [Dia 4-5]  Item 4e — Mercado Pago (ativa monetização)
└── [Paralelo] Item 3b — Worker Python no VPS (pode ser desenvolvido enquanto n8n ainda roda)

Semana 3
├── [Dia 1-4]  Item 3b — Finalizar e fazer cutover n8n → Python
└── [Dia 5]    Item 2e — Worker Python publica posts sociais agendados
```

| Item | Esforço total | Impacto |
|---|---|---|
| 1 — Bug vídeo | 30 min | Corrige bug visível |
| 2 — OAuth social em Configurações | 3–4 dias | Habilita publicação automatizada |
| 3a — Kanban clientes | 2–3 dias | CRM operacional |
| 3b — Worker Python | 4–5 dias | Independência do n8n |
| 4 — Assinaturas + créditos + MP | 6–8 dias | Monetização ativa |
| **Total** | **~17–22 dias** | |
