-- Editor de Vídeo — Fase 0 (Fundações), 14/07/2026
-- editor_projects: projetos de edição salvos no banco (mata a limitação de
--   1 rascunho por navegador do localStorage; doc = snapshot serializado).
-- editor_assets: biblioteca persistente de uploads do usuário (stickers,
--   músicas, fontes da marca...) — tabela nasce agora, uso pleno na Fase 6.

create table if not exists public.editor_projects (
  id         bigint generated always as identity primary key,
  user_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name       text not null default 'Meu projeto',
  doc        jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists editor_projects_user_idx
  on public.editor_projects (user_id, updated_at desc);

alter table public.editor_projects enable row level security;

drop policy if exists "editor_projects_select" on public.editor_projects;
create policy "editor_projects_select" on public.editor_projects
  for select using (user_id = auth.uid() or is_super_admin());

drop policy if exists "editor_projects_insert" on public.editor_projects;
create policy "editor_projects_insert" on public.editor_projects
  for insert with check (user_id = auth.uid());

drop policy if exists "editor_projects_update" on public.editor_projects;
create policy "editor_projects_update" on public.editor_projects
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "editor_projects_delete" on public.editor_projects;
create policy "editor_projects_delete" on public.editor_projects
  for delete using (user_id = auth.uid());


create table if not exists public.editor_assets (
  id           bigint generated always as identity primary key,
  user_id      uuid not null default auth.uid() references auth.users(id) on delete cascade,
  kind         text not null check (kind in ('sticker','music','audio','font','logo')),
  name         text not null default '',
  storage_path text not null,
  meta         jsonb not null default '{}'::jsonb,
  created_at   timestamptz not null default now()
);

create index if not exists editor_assets_user_idx
  on public.editor_assets (user_id, kind, created_at desc);

alter table public.editor_assets enable row level security;

drop policy if exists "editor_assets_select" on public.editor_assets;
create policy "editor_assets_select" on public.editor_assets
  for select using (user_id = auth.uid() or is_super_admin());

drop policy if exists "editor_assets_insert" on public.editor_assets;
create policy "editor_assets_insert" on public.editor_assets
  for insert with check (user_id = auth.uid());

drop policy if exists "editor_assets_update" on public.editor_assets;
create policy "editor_assets_update" on public.editor_assets
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "editor_assets_delete" on public.editor_assets;
create policy "editor_assets_delete" on public.editor_assets
  for delete using (user_id = auth.uid());
