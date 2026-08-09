-- =============================================================================
-- Diretor IA (criação de vídeo Premium/PRO por chat) — Leva 1: tabelas.
--
-- director_conversations: histórico do chat com o diretor, POR RASCUNHO
--   (draft_id → videos). Conversa iniciada antes do rascunho fica com draft_id
--   NULL e é ADOTADA pelo rascunho quando a tool iniciar_cenas o cria.
--   INSERT/UPDATE são EXCLUSIVOS da edge diretor-agent (service role) — o front
--   só lê (e pode apagar a conversa sem rascunho ao clicar "Novo vídeo").
--
-- director_pending_actions: proposta de débito aguardando confirmação explícita
--   do usuário (botão no chat). Token de uso único: id uuid não-adivinhável,
--   expira em 10 min, used_at marca o consumo. O débito real acontece no
--   video-api (/cenas/animar) SÓ no fluxo confirm_action da edge — nunca pelo LLM.
-- =============================================================================

create table if not exists public.director_conversations (
  id bigint generated always as identity primary key,
  professional_id uuid not null references public.professionals(id) on delete cascade,
  draft_id uuid references public.videos(id) on delete cascade,
  role text not null check (role in ('user', 'director')),
  content text not null default '',
  tool_calls jsonb,
  actions jsonb,
  pending_action jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_director_conversations_thread
  on public.director_conversations (professional_id, draft_id, created_at);

alter table public.director_conversations enable row level security;

drop policy if exists "Diretor conversas: dono le" on public.director_conversations;
create policy "Diretor conversas: dono le" on public.director_conversations
  for select using (
    exists (
      select 1 from public.professionals p
      where p.id = professional_id and p.user_id = auth.uid()
    ) or public.is_super_admin()
  );

-- "Novo vídeo" descarta a conversa que ainda não virou rascunho.
drop policy if exists "Diretor conversas: dono apaga sem rascunho" on public.director_conversations;
create policy "Diretor conversas: dono apaga sem rascunho" on public.director_conversations
  for delete using (
    draft_id is null and exists (
      select 1 from public.professionals p
      where p.id = professional_id and p.user_id = auth.uid()
    )
  );

create table if not exists public.director_pending_actions (
  id uuid primary key default gen_random_uuid(),
  professional_id uuid not null references public.professionals(id) on delete cascade,
  draft_id uuid not null references public.videos(id) on delete cascade,
  kind text not null check (kind in ('animar')),
  payload jsonb not null,
  credits_estimate integer not null,
  status text not null default 'pending'
    check (status in ('pending', 'confirmed', 'cancelled', 'expired')),
  expires_at timestamptz not null default (now() + interval '10 minutes'),
  used_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_director_pending_draft
  on public.director_pending_actions (draft_id, status);

alter table public.director_pending_actions enable row level security;

drop policy if exists "Diretor pending: dono le" on public.director_pending_actions;
create policy "Diretor pending: dono le" on public.director_pending_actions
  for select using (
    exists (
      select 1 from public.professionals p
      where p.id = professional_id and p.user_id = auth.uid()
    ) or public.is_super_admin()
  );
-- Escrita: nenhuma policy → só a edge (service role) insere/atualiza.
