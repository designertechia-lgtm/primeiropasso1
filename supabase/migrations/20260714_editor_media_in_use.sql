-- Editor de Vídeo — mídias duráveis (14/07/2026)
-- A limpeza do Storage apaga editor-drafts/ com mais de 48h. Isso matava as
-- mídias (música, sticker, áudio posicionado, logo da capa) de PROJETOS SALVOS:
-- reabrir um projeto de 3 dias e renderizar dava 404 "expirou no servidor".
-- Este RPC diz ao worker quais mídias ainda são referenciadas por algum projeto
-- vivo — elas ficam preservadas, e só o que ninguém referencia expira por idade.
--
-- Extração no servidor de propósito: editor_projects.doc guarda o snapshot
-- inteiro (inclusive as thumbnails da timeline em base64), então baixar os docs
-- no worker só para ler os ids seria caro.
--
-- Formato do doc: ProjectSnapshot = {v, meta, sourceLabel, ..., doc: {...}}
-- — as mídias ficam no sub-objeto "doc".
--
-- Devolve UM jsonb (array), não `setof text`: o PostgREST corta respostas em
-- max_rows (1000 neste projeto) SEM erro — com o crescimento da base, mídias
-- referenciadas ficariam fora da lista e o GC as apagaria. Uma linha só nunca
-- é truncada.

drop function if exists public.editor_media_in_use();

create or replace function public.editor_media_in_use()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(jsonb_agg(distinct ref), '[]'::jsonb)
    from (
      select p.doc->'doc'->>'musicUploadId' as ref
        from public.editor_projects p
       where coalesce(p.doc->'doc'->>'musicUploadId', '') <> ''
      union all
      select p.doc->'doc'->>'introUploadId'
        from public.editor_projects p
       where coalesce(p.doc->'doc'->>'introUploadId', '') <> ''
      union all
      select s->>'upload_id'
        from public.editor_projects p
        cross join lateral jsonb_array_elements(
          case when jsonb_typeof(p.doc->'doc'->'stickers') = 'array'
               then p.doc->'doc'->'stickers' else '[]'::jsonb end) s
       where coalesce(s->>'upload_id', '') <> ''
      union all
      select a->>'upload_id'
        from public.editor_projects p
        cross join lateral jsonb_array_elements(
          case when jsonb_typeof(p.doc->'doc'->'audioClips') = 'array'
               then p.doc->'doc'->'audioClips' else '[]'::jsonb end) a
       where coalesce(a->>'upload_id', '') <> ''
    ) refs;
$$;

-- security definer lê os projetos de TODOS os usuários — só o worker (service
-- role) pode chamar; nunca o navegador.
revoke all on function public.editor_media_in_use() from public, anon, authenticated;
grant execute on function public.editor_media_in_use() to service_role;
