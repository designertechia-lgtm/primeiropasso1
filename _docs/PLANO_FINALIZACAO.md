# Plano de Finalização — Primeiro Passo
*Atualizado em 12/05/2026 — expansão com 4 novas frentes de criação de conteúdo (itens 5-8)*
*Versão anterior: 28/04/2026 — baseada em `AgenteConversaPasso01.json` e `RAG Workflow com Vector ID.json`*

---

## Contexto do que os docs revelam

Os dois arquivos n8n revelam que o projeto já tem uma **arquitetura de atendimento inteligente via WhatsApp**:

- **`AgenteConversaPasso01.json`** — Agente conversacional completo que recebe mensagens do WhatsApp via EvolutionAPI, processa texto/áudio (Whisper)/imagem (GPT-4o Vision), tem memória de conversa no PostgreSQL, anti-flood com Redis, e um orquestrador GPT-4o que atua como assistente do profissional — perfila o lead, negocia preço (promocional/mínimo/máximo), busca horários disponíveis no Supabase e cria agendamentos.
- **`RAG Workflow com Vector ID.json`** — Pipeline que recebe PDFs via webhook, extrai o texto, embeda com OpenAI e grava no Supabase Vector Store para que o agente possa consultar base de conhecimento.

Isso muda a visão do Kanban: ele não é só gestão de leads estáticos — é o **painel de controle das conversas ativas do agente de IA**.

---

## Item 1 — Bug: Card de vídeo 16:9 estourando

**Status:** ✅ Concluído

**Causa:** Em `src/components/landing/ContentSection.tsx:72`, quando `playing=true` e é vídeo nativo (`.mp4`), o componente retorna um `<div className="aspect-video">` com `<video>` dentro — mas o wrapper `<Card>` de cima não tem `overflow-hidden` aplicado consistentemente. Em `src/pages/VideosListPage.tsx:84` o problema é que o `div.aspect-video` é o contêiner estático, mas quando `playing=true` o conteúdo retornado sai desse contêiner — a altura quebra.

**Correção:** Manter o `div.aspect-video` sempre presente como wrapper fixo e renderizar player/thumbnail dentro dele, nunca trocando o wrapper. Mudança em dois arquivos, ~20 linhas.

**Arquivos afetados:**
- `src/components/landing/ContentSection.tsx` (linha 72–87)
- `src/pages/VideosListPage.tsx` (linha 84–123)

**Esforço:** 30 min | **Prioridade: Imediata**

---

## Item 2 — Autenticação de redes sociais em Configurações

**Status:** ✅ Concluído (28/04/2026)

**O que foi entregue:**
- Migration `20260428000000_add_social_accounts.sql` — tabela `social_accounts` com RLS
- Supabase Function `oauth-connect` — gera a URL OAuth autenticando o usuário via JWT
- Supabase Function `oauth-meta-callback` — troca code → token Meta, resolve conta Instagram Business, faz upsert
- Supabase Function `oauth-linkedin-callback` — troca code → token LinkedIn, busca perfil, faz upsert
- `AdminConfiguracoes.tsx` — seção "Contas Conectadas" com cards Instagram/LinkedIn, status, botão Conectar/Desconectar, alerta de token expirando

**Variáveis de ambiente necessárias no Supabase (Settings → Edge Functions → Secrets):**
- `META_APP_ID` e `META_APP_SECRET` — app do Meta for Developers
- `LINKEDIN_CLIENT_ID` e `LINKEDIN_CLIENT_SECRET` — app do LinkedIn Developers

**Item 2e (worker Python de publicação)** será implementado junto com o Item 3b (Worker Python VPS).

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
| 5 — Multi-formato + Calendário editorial | 7–10 dias | Multiplica produção por 3-5× sem trabalho extra |
| 6 — Templates/Biblioteca por especialidade | 4–6 dias | Diferencial competitivo + ativação rápida |
| 7 — Multi-IA de vídeo + edição fina | 6–8 dias | Margem flexível, controle de custo, qualidade premium |
| 8 — Inteligência de engajamento | 8–12 dias | Loop fechado: cria → publica → analisa → cria de novo |
| **Total** | **~42–62 dias** | |

---

# Expansão — Frente de Criação de Conteúdo (12/05/2026)

> Objetivo: transformar a plataforma de "gerador de vídeos curtos com avatar" em **suite completa de presença digital + atendimento automatizado**, justificando upsell para planos superiores.

---

## Item 5 — Multi-formato + Calendário Editorial

A mesma ideia/tema vira **múltiplas saídas em formatos diferentes**, com agendamento estratégico ao longo da semana.

### 5a. Pipeline multi-formato a partir do mesmo tema

| Formato | Pipeline | Onde publica |
|---|---|---|
| **Vídeo curto 9:16** (atual) | Roteiro → TTS → Avatar HeyGen → Creatomate | TikTok, Reels, Shorts |
| **Vídeo horizontal 16:9** | Mesmo roteiro reformatado → render landscape | YouTube longo |
| **Carrossel Instagram** | Roteiro fatiado em 5-10 slides → design template (Tailwind/Figma export) | Instagram feed |
| **Post estático 1:1** | Quote ou insight-chave → card com tipografia editorial | Instagram, LinkedIn, Facebook |
| **Artigo de blog SEO** | Roteiro expandido com Gemini → markdown + meta tags | Blog do terapeuta (`/{slug}/artigo/...`) |
| **E-book / PDF lead-magnet** | Compilação de 5-10 artigos em PDF estilizado | Captação de leads em `/{slug}/?lead-magnet=...` |

### 5b. Calendário editorial

Nova rota `/admin/calendario` com:
- **Visão mensal e semanal** (FullCalendar já no projeto)
- **Drag-and-drop** pra mover publicações de dia/hora
- **Tipos de conteúdo coloridos** (vídeo curto, carrossel, blog, etc.)
- **Vínculo com a agenda real** — palestra na quarta? Posta conteúdo sobre o tema na terça
- **Distribuição automática inteligente**: ao programar 8 posts/semana, a plataforma sugere mix (3 vídeos + 2 carrosséis + 2 posts + 1 blog)
- **Scheduling horário-ótimo** baseado em dados de engajamento (Item 8)

### 5c. Schema adicional

```sql
CREATE TABLE content_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  professional_id uuid REFERENCES professionals(id),
  topic_id uuid REFERENCES topics(id),
  format text NOT NULL,  -- 'video-short' | 'video-long' | 'carousel' | 'post' | 'blog' | 'ebook'
  asset_urls jsonb,      -- {video: '...', thumbnail: '...', slides: [...]}
  scheduled_at timestamptz,
  published_at timestamptz,
  platforms text[],      -- ['youtube', 'tiktok', 'instagram', 'linkedin', 'blog']
  status text DEFAULT 'draft', -- 'draft' | 'scheduled' | 'published' | 'failed'
  created_at timestamptz DEFAULT now()
);
```

**Esforço:** 7–10 dias | **Prioridade: Alta** *(maior alavanca de ROI por hora do terapeuta)*

---

## Item 6 — Templates / Biblioteca por Especialidade

Plataforma deixa de ser genérica e vira **especializada por nicho clínico**, com kits de marca prontos e biblioteca curada.

### 6a. Kits de marca por especialidade

Cada terapeuta escolhe sua especialidade no onboarding e recebe um **kit completo**:

| Especialidade | Paleta | Tipografia | Música | Tom de voz |
|---|---|---|---|---|
| **TCC adulto** | Cyan + verde sálvia | Lora + Raleway | Lo-fi calmo | Técnico-acolhedor |
| **Ansiedade infantil** | Pastel quente | Quicksand + Nunito | Pop instrumental | Lúdico-acolhedor |
| **Terapia de casal** | Roxo + dourado | Cormorant + Inter | Acústico romântico | Empático-imparcial |
| **Lutos e perdas** | Tons sóbrios (cinza azulado) | Playfair + Source Sans | Piano contemplativo | Pausado-respeitoso |
| **Autoestima/desenvolvimento** | Verde + dourado | Montserrat + Lora | Energético-suave | Motivador-equilibrado |
| **Compulsões/TOC** | Azul profundo + branco | DM Serif + Inter | Minimal techno | Estruturado-firme |

Cada kit traz:
- 3 templates de intro animada (1-2s)
- 5 templates de transição
- 3 estilos de legenda animada (sincronizada com áudio)
- 2-3 trilhas musicais licenciadas
- Filtros de cor para B-roll

### 6b. Biblioteca compartilhada de ideias

Nova rota `/admin/biblioteca` com:
- **Banco curado** de 200+ ideias virais já validadas, por categoria
- **Atualização semanal automática** — IA varre tendências de Instagram/TikTok e adiciona novas
- **Filtros**: especialidade, formato, score de viralidade estimado, dificuldade
- **"Trending now"** — temas em alta nas últimas 72h
- **Personalização**: terapeuta favorita ideias, plataforma sugere mais do mesmo cluster
- **Conteúdo público vs premium** — plano Starter vê 50 ideias/mês, Pro+ vê tudo

### 6c. Schema adicional

```sql
CREATE TABLE content_kits (
  id text PRIMARY KEY,  -- 'tcc-adulto' | 'ansiedade-infantil' | ...
  name text NOT NULL,
  palette jsonb,        -- {primary, accent, bg, fg}
  fonts jsonb,          -- {heading, body}
  music_urls text[],
  intro_templates jsonb,
  transition_templates jsonb,
  caption_styles jsonb
);

CREATE TABLE idea_library (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  specialty text NOT NULL,
  title text NOT NULL,
  hook text,
  angle text,
  format_suggestions text[],
  virality_score numeric,  -- 0-100 baseado em dados sociais
  trending_until timestamptz,
  premium boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE professionals ADD COLUMN specialty text;
ALTER TABLE professionals ADD COLUMN content_kit_id text REFERENCES content_kits(id);
```

**Esforço:** 4–6 dias (kits) + curadoria contínua | **Prioridade: Alta** *(ativação no onboarding + retenção)*

---

## Item 7 — Multi-IA de Vídeo + Edição Fina

Independência do HeyGen + controle de custo + qualidade premium opcional.

### 7a. Adaptador unificado de IA de vídeo

Em vez de hardcodear HeyGen, abstrair via interface:

```python
class VideoProvider(ABC):
    @abstractmethod
    def generate(self, script: str, voice_url: str, options: dict) -> VideoJob: ...

class HeyGenProvider(VideoProvider): ...   # avatar realista (premium)
class KlingProvider(VideoProvider): ...    # cinematográfico, sem avatar
class VeoProvider(VideoProvider): ...      # Google Veo Pro (alto custo)
class SoraProvider(VideoProvider): ...     # quando disponível na API
class PikaProvider(VideoProvider): ...     # B-roll, animações curtas
```

| Provider | Caso de uso | Custo estimado/vídeo |
|---|---|---|
| **HeyGen** | Avatar fotorrealista, lip-sync clínico | R$ 0,80–1,20 |
| **Kling AI** | Cenas cinematográficas (sem rosto) | R$ 0,50–1,00 |
| **Google Veo** | Alta qualidade institucional | R$ 1,50–3,00 |
| **Sora** | Visão criativa, conceitos abstratos | R$ 2,00–4,00 |
| **Pika** | B-roll, transições animadas | R$ 0,20–0,40 |

### 7b. Escolha contextual da IA

- **Por plano**: Starter usa Pika+HeyGen; Pro adiciona Kling; Scale libera Veo/Sora
- **Por créditos**: usuário pode pagar a diferença pra usar premium num vídeo específico
- **Sugestão automática**: roteiro abstrato/conceitual → sugere Veo/Sora; depoimento direto → HeyGen
- **Override manual** sempre disponível

### 7c. Editor de roteiro avançado

Nova rota `/admin/criar-video-pro` (já existe — expandir) com:
- **Markup de ênfase de voz** — `**negrito**` = pausa enfática, `_itálico_` = sussurro, `[tom: rápido]` = ritmo
- **Highlight de palavras-chave** — palavras destacadas aparecem em legenda destaque grande
- **Seleção de B-roll por trecho** — para cada frase, escolher: avatar / B-roll banco / B-roll Pika gerado / imagem estática
- **Preview por trecho** antes do render final completo (economiza créditos)
- **Variantes A/B** — gera 2-3 versões do hook, mantém a melhor
- **Templates de transição** — corte, fade, zoom, parallax

### 7d. Banco de B-roll

```sql
CREATE TABLE b_roll_library (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category text NOT NULL,  -- 'natureza' | 'urbano' | 'abstrato' | 'pessoa-genérica' | ...
  url text NOT NULL,
  duration_seconds int,
  source text,  -- 'stock' | 'pika-generated' | 'user-upload'
  tags text[],
  license text  -- 'cc0' | 'platform-paid' | 'user-owned'
);
```

**Esforço:** 6–8 dias | **Prioridade: Média-Alta** *(libera tier premium e reduz dependência de fornecedor único)*

---

## Item 8 — Inteligência de Engajamento

Loop fechado: o que publicamos → como performou → o que publicar a seguir.

### 8a. Analytics dashboard avançado

Nova rota `/admin/analytics`:
- **Posts virais** — destaque pra publicações com engajamento >2× média do terapeuta
- **Heatmap de horários** — quando seu público está mais ativo, por rede
- **Tópicos que ressoam** — IA agrupa temas; mostra o que gera mais salvamentos/compartilhamentos
- **Funil completo** — impressões → views → cliques no perfil → DMs → agendamentos via agente
- **Comparativos** — performance por formato, por kit, por dia da semana

### 8b. Sugestão automática de próximos tópicos

- Detecta post viral → "Esse vídeo bombou. Quer fazer 3 variações?"
- Sugere próximo ângulo na mesma série temática
- Aprende com aprovações/rejeições do terapeuta no agente
- Alimenta a biblioteca (item 6b) com personalização

### 8c. Resposta automática a interações sociais

Estende o agente WhatsApp atual para responder DMs e comentários públicos:

| Plataforma | Endpoint | Tom |
|---|---|---|
| **Instagram DM** | Meta API `/me/messages` | Espelha tom do terapeuta via RAG |
| **Comentários Instagram** | Meta API `/{media-id}/comments` | Curto, acolhedor, encaminha para DM se sensível |
| **LinkedIn comentários** | LinkedIn API `/socialActions` | Profissional, técnico |
| **WhatsApp** | Já existe | (sem mudança) |

**Filtros de segurança críticos:**
- Termos sensíveis (suicídio, abuso, automutilação, urgência) → **escalona para humano imediatamente**
- Pergunta clínica direta ("é normal eu sentir X?") → resposta padronizada de redirecionamento ético, **não dá diagnóstico**
- Conteúdo ofensivo → modera + bloqueia

### 8d. Schema adicional

```sql
CREATE TABLE social_metrics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  content_item_id uuid REFERENCES content_items(id),
  platform text NOT NULL,
  fetched_at timestamptz DEFAULT now(),
  impressions int, views int, likes int, comments int, shares int, saves int,
  profile_clicks int, dm_starts int
);

CREATE TABLE social_interactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  professional_id uuid REFERENCES professionals(id),
  platform text NOT NULL,
  external_user_id text,
  type text NOT NULL,  -- 'dm' | 'comment' | 'reply'
  content text,
  agent_response text,
  status text,  -- 'agent-replied' | 'escalated-human' | 'flagged-sensitive'
  created_at timestamptz DEFAULT now()
);
```

**Esforço:** 8–12 dias | **Prioridade: Média** *(depende dos itens 5 e 6 estarem maduros)*

---

## Características que devem aparecer na landing oficial

A landing atual (`Index.tsx`) ainda vende um produto mais simples do que o real. Após os itens 5-8, a proposta de valor cresce significativamente. Pontos-chave para destacar:

1. **Agente WhatsApp inteligente** — não só envia notificação: **conversa, negocia, agenda sozinho**. (Item já implementado via n8n, migração Python no item 3b.)
2. **RAG personalizado** — upload de PDFs do terapeuta → o agente fala no estilo dele com base nos textos dele.
3. **Multi-formato** — uma ideia vira vídeo curto + carrossel + post + artigo + e-book.
4. **Templates por especialidade** — TCC, ansiedade infantil, casais, lutos, autoestima, TOC — cada um com kit visual e biblioteca curada.
5. **Multi-IA** — escolha entre HeyGen (avatar), Kling/Veo/Sora (cinematográfico) e Pika (B-roll). Paga só o que usa.
6. **CRM Kanban com 6 estágios** baseado em sinais reais do agente.
7. **Analytics + sugestão de próximos tópicos** — loop fechado de criação ↔ performance.
8. **Resposta automática a DMs/comentários** com tom do terapeuta + filtros de segurança.
9. **Calendário editorial** vinculado à agenda real do consultório.
10. **Sistema flexível** — plano mensal + créditos avulsos (Pix/cartão via Mercado Pago).
