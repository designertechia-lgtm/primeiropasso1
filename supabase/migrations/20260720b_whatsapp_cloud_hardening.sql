-- Robustez do canal Cloud (achados da revisão adversarial 20/07) — parte SQL
--  H) upsert por phone_number_id atualizava a conta de OUTRO profissional em silêncio
--     (retornava sucesso sem criar linha para o selecionado) → agora rejeita explicitamente.
--  C) profissional que vai direto pro cloud pode não ter evolution_instance_name — que é a
--     CHAVE de lookup do pipeline (whatsapp-webhook resolve o dono por essa coluna).
--     O cadastro da conta cloud passa a garantir um identificador sintético estável.

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
  v_owner uuid;
  v_instance text;
begin
  if not public.is_super_admin() then
    raise exception 'not_authorized';
  end if;

  if not exists (select 1 from public.professionals where id = p_professional_id) then
    raise exception 'professional_not_found';
  end if;

  -- H: um phone_number_id pertence a UM profissional. Transferir exige desativar antes,
  --    de forma consciente — nunca sobrescrever a conta alheia achando que criou a sua.
  select professional_id into v_owner
  from public.whatsapp_cloud_accounts
  where phone_number_id = p_phone_number_id;

  if v_owner is not null and v_owner <> p_professional_id then
    raise exception 'phone_number_id_in_use_by_other_professional';
  end if;

  -- C: garante a chave de roteamento do pipeline para quem nunca teve instância Evolution.
  select evolution_instance_name into v_instance
  from public.professionals where id = p_professional_id;

  if v_instance is null or v_instance = '' then
    v_instance := 'cloud_' || replace(p_professional_id::text, '-', '');
    update public.professionals
       set evolution_instance_name = v_instance
     where id = p_professional_id;
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

  return jsonb_build_object('id', v_id, 'status', 'active', 'instance_name', v_instance);
end;
$$;

grant execute on function public.admin_upsert_whatsapp_cloud_account(uuid, text, text, text, text, text) to authenticated;
