-- ============================================================
-- WhatsApp Cloud API (oficial) — contas por profissional (multi-tenant)
-- Data: 2026-06-26
--
-- Mapeia o `phone_number_id` (que vem em TODO webhook da Meta) -> profissional + token.
-- É o equivalente oficial do `professionals.evolution_instance_name` do Evolution.
-- Evolution e Cloud coexistem: um profissional usa um OU outro.
-- ============================================================

create table if not exists whatsapp_cloud_accounts (
  id               uuid        primary key default gen_random_uuid(),
  professional_id  uuid        not null references professionals(id) on delete cascade,
  phone_number_id  text        not null unique,   -- chave que o webhook usa pra achar o profissional
  waba_id          text,                          -- WhatsApp Business Account ID
  access_token     text        not null,          -- token do número (System User / Embedded Signup)
  display_number   text,                          -- número exibível (+55 11 9...)
  verified_name    text,                          -- nome verificado do remetente
  status           text        not null default 'active'
                               check (status in ('active', 'disconnected')),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (professional_id)                         -- 1 conta oficial por profissional
);

alter table whatsapp_cloud_accounts enable row level security;

-- Profissional gerencia só a própria conta (mesmo padrão de social_accounts).
-- O webhook e o envio usam service_role (ignora RLS).
create policy "professional manages own whatsapp cloud account"
  on whatsapp_cloud_accounts
  for all
  using (professional_id in (select id from professionals where user_id = auth.uid()));

create index if not exists idx_whatsapp_cloud_phone on whatsapp_cloud_accounts (phone_number_id);
