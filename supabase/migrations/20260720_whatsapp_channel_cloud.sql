-- Canal de WhatsApp por profissional (Evolution x Cloud API oficial) — 20/07/2026
-- Contexto: números banidos no Baileys (caso Daiane) migram para a Cloud API.
-- O canal decide COMO ENVIAR; a recepção se auto-roteia pelos webhooks.

-- 1) Escolha de canal do profissional
alter table public.professionals
  add column if not exists whatsapp_channel text not null default 'evolution'
  check (whatsapp_channel in ('evolution', 'cloud'));

comment on column public.professionals.whatsapp_channel is
  'Canal de envio do WhatsApp: evolution (Baileys/QR) ou cloud (API oficial da Meta).';

-- 2) Roteamento inequívoco do webhook Cloud: um phone_number_id pertence a UMA conta
create unique index if not exists whatsapp_cloud_accounts_phone_number_id_key
  on public.whatsapp_cloud_accounts (phone_number_id);

-- No máximo UMA conta cloud ativa por profissional
create unique index if not exists whatsapp_cloud_accounts_one_active_per_pro
  on public.whatsapp_cloud_accounts (professional_id)
  where status = 'active';

-- 3) SEGURANÇA: o access_token da Meta NUNCA chega ao navegador.
--    A policy antiga dava ao dono SELECT/ALL (token exposto). Fecha: só super-admin.
--    Edges usam service role (bypass). O dono consulta status via RPC mascarada abaixo.
drop policy if exists "professional manages own whatsapp cloud account" on public.whatsapp_cloud_accounts;

drop policy if exists "super admin manages whatsapp cloud accounts" on public.whatsapp_cloud_accounts;
create policy "super admin manages whatsapp cloud accounts"
  on public.whatsapp_cloud_accounts for all
  using (public.is_super_admin())
  with check (public.is_super_admin());

-- 4) Status da conexão Cloud para o DONO (sem token)
create or replace function public.owner_whatsapp_cloud_status()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row record;
begin
  select a.status, a.display_number, a.verified_name, a.updated_at
    into v_row
  from public.whatsapp_cloud_accounts a
  join public.professionals p on p.id = a.professional_id
  where p.user_id = auth.uid()
  order by (a.status = 'active') desc, a.updated_at desc
  limit 1;

  if v_row is null then
    return jsonb_build_object('status', 'not_configured');
  end if;

  return jsonb_build_object(
    'status', v_row.status,
    'display_number', v_row.display_number,
    'verified_name', v_row.verified_name,
    'updated_at', v_row.updated_at
  );
end;
$$;

grant execute on function public.owner_whatsapp_cloud_status() to authenticated;

-- 5) Cadastro/atualização pelo SUPER-ADMIN via RPC (o painel admin-gerente usa esta
--    rota; token entra, nunca sai — a leitura de volta é mascarada).
create or replace function public.admin_upsert_whatsapp_cloud_account(
  p_professional_id uuid,
  p_phone_number_id text,
  p_access_token text,
  p_waba_id text default null,
  p_display_number text default null,
  p_verified_name text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if not public.is_super_admin() then
    raise exception 'not_authorized';
  end if;

  -- desativa contas ativas anteriores do profissional (troca de número)
  update public.whatsapp_cloud_accounts
     set status = 'inactive', updated_at = now()
   where professional_id = p_professional_id and status = 'active'
     and phone_number_id <> p_phone_number_id;

  insert into public.whatsapp_cloud_accounts
    (professional_id, phone_number_id, access_token, waba_id, display_number, verified_name, status)
  values
    (p_professional_id, p_phone_number_id, p_access_token, p_waba_id, p_display_number, p_verified_name, 'active')
  on conflict (phone_number_id) do update
    set access_token = excluded.access_token,
        waba_id = coalesce(excluded.waba_id, whatsapp_cloud_accounts.waba_id),
        display_number = coalesce(excluded.display_number, whatsapp_cloud_accounts.display_number),
        verified_name = coalesce(excluded.verified_name, whatsapp_cloud_accounts.verified_name),
        status = 'active',
        updated_at = now()
  returning id into v_id;

  return jsonb_build_object('id', v_id, 'status', 'active');
end;
$$;

grant execute on function public.admin_upsert_whatsapp_cloud_account(uuid, text, text, text, text, text) to authenticated;

-- 6) Troca de canal pelo SUPER-ADMIN (mesma tela)
create or replace function public.admin_set_whatsapp_channel(
  p_professional_id uuid,
  p_channel text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_super_admin() then
    raise exception 'not_authorized';
  end if;
  if p_channel not in ('evolution', 'cloud') then
    raise exception 'invalid_channel';
  end if;
  if p_channel = 'cloud' and not exists (
    select 1 from public.whatsapp_cloud_accounts
    where professional_id = p_professional_id and status = 'active'
  ) then
    raise exception 'no_active_cloud_account';
  end if;

  update public.professionals
     set whatsapp_channel = p_channel
   where id = p_professional_id;

  return jsonb_build_object('professional_id', p_professional_id, 'channel', p_channel);
end;
$$;

grant execute on function public.admin_set_whatsapp_channel(uuid, text) to authenticated;
