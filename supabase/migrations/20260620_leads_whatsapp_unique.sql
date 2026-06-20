-- =============================================================================
-- Anti-duplicidade de leads por telefone.
-- O telefone (whatsapp, formato canônico: só dígitos com 55) é o identificador
-- principal do lead DENTRO de um profissional. UNIQUE por (professional_id,
-- whatsapp) impede leads duplicados com o mesmo número no mesmo profissional,
-- mas PERMITE o mesmo número existir em profissionais diferentes (uma pessoa
-- pode ser paciente de mais de um profissional). NULL é permitido múltiplas
-- vezes (default "nulls distinct"), então leads sem telefone não quebram.
-- =============================================================================
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'leads_professional_whatsapp_unique'
  ) then
    alter table public.leads
      add constraint leads_professional_whatsapp_unique unique (professional_id, whatsapp);
  end if;
end $$;
