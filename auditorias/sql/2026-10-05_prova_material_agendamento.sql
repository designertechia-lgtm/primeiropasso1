-- ============================================================================
-- PROVA MATERIAL — auditoria do fluxo de agendamento (Drika) — 2026-10-05
-- Rodar com:  python .claude/skills/delegado-auditoria-investigacao/scripts/query_pp.py <arquivo>.sql out.json
-- (uma consulta por vez; troque :pid pelo id da profissional achado na consulta 0)
-- Horários SEMPRE em America/Sao_Paulo.
-- ============================================================================

-- 0) Quem é a Drika (e a configuração que muda o comportamento da agenda)
select id, full_name, slug, attendance_mode, address, slot_buffer_minutes, skip_national_holidays,
       whatsapp_channel,
       agent_preferences->>'enabled'      as agente_ligado,
       agent_preferences->>'reminders'    as lembretes,
       agent_preferences->>'satisfaction' as satisfacao,
       (agent_preferences->>'owner_whatsapp') is not null as tem_numero_autorizado
from professionals
where full_name ilike '%drika%' or full_name ilike '%adriana%' or slug ilike '%drika%';

-- 1) [F1] Sessões PASSADAS presas em 'pending' (o auto-complete só conclui 'confirmed').
--    Cada uma era o alvo errado do remarcar/cancelar antigo (getActiveAppointment = mais ANTIGA).
select count(*) as passadas_pendentes
from appointments a
where a.professional_id = :pid and a.appointment_type = 'booking' and a.status = 'pending'
  and (a.appointment_date + a.end_time) < (now() at time zone 'America/Sao_Paulo');

-- 1b) Leads EXPOSTOS ao bug: têm pendente passada E um horário futuro ativo ao mesmo tempo
select l.name, l.whatsapp,
       min(a.appointment_date) filter (where (a.appointment_date + a.end_time) <  (now() at time zone 'America/Sao_Paulo')) as passada_mais_antiga,
       min(a.appointment_date) filter (where (a.appointment_date + a.start_time) > (now() at time zone 'America/Sao_Paulo')) as proxima_futura
from appointments a join leads l on l.id = a.lead_id
where a.professional_id = :pid and a.appointment_type = 'booking' and a.status in ('pending', 'confirmed')
group by l.id, l.name, l.whatsapp
having count(*) filter (where (a.appointment_date + a.end_time) <  (now() at time zone 'America/Sao_Paulo')) > 0
   and count(*) filter (where (a.appointment_date + a.start_time) > (now() at time zone 'America/Sao_Paulo')) > 0;

-- 1c) DANO do cancelar antigo: cancelamento de um horário que JÁ TINHA PASSADO, com outro futuro
--     do mesmo lead que ficou de pé (o lead ouviu "cancelei" e a sessão real continuou na agenda).
select c.id, c.appointment_date as cancelada_data, c.start_time,
       (c.updated_at at time zone 'America/Sao_Paulo') as cancelado_em,
       f.appointment_date as futura_que_ficou, f.start_time as futura_hora, c.notes
from appointments c
join appointments f on f.lead_id = c.lead_id and f.professional_id = c.professional_id
                   and f.id <> c.id and f.status in ('pending', 'confirmed')
                   and f.appointment_date >= (c.updated_at at time zone 'America/Sao_Paulo')::date
where c.professional_id = :pid and c.status = 'cancelled'
  and c.appointment_date < (c.updated_at at time zone 'America/Sao_Paulo')::date
order by c.updated_at desc;

-- 1d) Paciente com MAIS DE UM horário futuro ativo (série do painel OU remarcar antigo que
--     "ressuscitou" a sessão velha em vez de mover a futura)
select l.name, a.lead_id, count(*) as futuros, string_agg(a.appointment_date || ' ' || left(a.start_time::text, 5), ' · ' order by a.appointment_date) as horarios
from appointments a left join leads l on l.id = a.lead_id
where a.professional_id = :pid and a.appointment_type = 'booking' and a.status in ('pending', 'confirmed')
  and (a.appointment_date + a.start_time) > (now() at time zone 'America/Sao_Paulo')
group by l.name, a.lead_id having count(*) > 1;

-- 2) [F5] Taxa de resposta capturada dos lembretes (antes: 'Confirmar' caía no LLM sem casar)
select r.kind, count(*) as enviados, count(r.patient_response) as com_resposta,
       count(*) filter (where r.patient_response = 'confirmed') as confirmados,
       count(*) filter (where r.patient_response = 'cancelled') as cancelados,
       count(*) filter (where r.patient_response = 'reschedule_requested') as pediram_remarcar
from appointment_reminders r join appointments a on a.id = r.appointment_id
where a.professional_id = :pid group by r.kind order by r.kind;

-- 2b) 'Confirmar'/'Cancelar'/'Remarcar' do lead e a resposta que ele recebeu. Se a resposta NÃO é
--     "Combinado…"/"Tudo bem, … cancel…", o webhook não casou o lembrete e o LLM respondeu sem mudar o status.
select (m.created_at at time zone 'America/Sao_Paulo') as quando, l.name, m.content as lead_disse,
       (select m2.content from chat_messages m2 where m2.lead_id = m.lead_id and m2.role = 'assistant'
          and m2.created_at > m.created_at order by m2.created_at limit 1) as resposta
from chat_messages m join leads l on l.id = m.lead_id
where l.professional_id = :pid and m.role = 'user' and m.content ~* '^\s*(confirmar|cancelar|remarcar)'
order by m.created_at desc limit 50;

-- 2c) Janelas com mais de 5 lembretes na plataforma inteira em 6h (o limit(5) global antigo perdia o do lead)
select date_trunc('hour', r.sent_at at time zone 'America/Sao_Paulo') as hora, count(*) as lembretes
from appointment_reminders r where r.kind in ('24h', '1h')
group by 1 having count(*) > 5 order by 1 desc limit 30;

-- 3) [F7] Notas de satisfação e a mensagem que gerou cada uma ("Bom dia…" virava nota 'bom')
select (r.response_at at time zone 'America/Sao_Paulo') as respondeu_em, r.patient_response as nota,
       (select m.content from chat_messages m where m.lead_id = a.lead_id and m.role = 'user'
          and m.created_at <= r.response_at order by m.created_at desc limit 1) as mensagem
from appointment_reminders r join appointments a on a.id = r.appointment_id
where a.professional_id = :pid and r.kind = 'satisfaction' and r.patient_response in ('otimo', 'bom', 'ruim')
order by r.response_at desc;

-- 3b) [F8] Atendimentos do PAINEL que nunca receberam pesquisa (lead_id existe, booking_state não aponta)
select a.appointment_date, left(a.start_time::text, 5) as hora, l.name,
       exists (select 1 from appointment_reminders r where r.appointment_id = a.id and r.kind = 'satisfaction') as pesquisa_registrada
from appointments a join leads l on l.id = a.lead_id
where a.professional_id = :pid and a.appointment_type = 'booking' and a.status in ('pending', 'confirmed', 'completed')
  and (a.appointment_date + a.end_time) < (now() at time zone 'America/Sao_Paulo')
  and coalesce(l.booking_state->>'appointment_id', '') <> a.id::text
order by a.appointment_date desc limit 30;

-- 4) [F2] Horários marcados em feriado próprio ou em dia da semana sem atendimento
select a.appointment_date, extract(dow from a.appointment_date) as dow, left(a.start_time::text, 5) as hora, a.status
from appointments a
where a.professional_id = :pid and a.appointment_type = 'booking' and a.status <> 'cancelled'
  and ( exists (select 1 from professional_holidays h where h.professional_id = a.professional_id and h.date = a.appointment_date)
     or ( exists (select 1 from availability v where v.professional_id = a.professional_id and v.active)
          and not exists (select 1 from availability v where v.professional_id = a.professional_id and v.active
                          and v.day_of_week = extract(dow from a.appointment_date)) ) )
order by a.appointment_date desc;

-- 5) [R1 — decisão] Horários FORA do expediente cadastrado (o modelo "agenda por bloqueio" aceita)
select a.appointment_date, left(a.start_time::text, 5) as inicio, left(a.end_time::text, 5) as fim, a.status
from appointments a
where a.professional_id = :pid and a.appointment_type = 'booking' and a.status <> 'cancelled'
  and exists (select 1 from availability v where v.professional_id = a.professional_id and v.active)
  and not exists (select 1 from availability v where v.professional_id = a.professional_id and v.active
                  and v.day_of_week = extract(dow from a.appointment_date)
                  and a.start_time >= v.start_time and a.end_time <= v.end_time)
order by a.appointment_date desc;

-- 6) [R2 — decisão] Serviços: o agente SEMPRE usa o 1º ativo (mais antigo) pra duração/nome
select name, duration_minutes, active, created_at from professional_services where professional_id = :pid order by created_at;

-- 7) [F6] Leitura humana: últimas confirmações "Marcado!" e o que o lead pediu antes (dia certo?)
select (m.created_at at time zone 'America/Sao_Paulo') as quando, m.content as confirmacao,
       (select string_agg(u.content, ' | ' order by u.created_at)
          from (select content, created_at from chat_messages u where u.lead_id = m.lead_id and u.role = 'user'
                  and u.created_at < m.created_at order by u.created_at desc limit 3) u) as pedido_do_lead
from chat_messages m join leads l on l.id = m.lead_id
where l.professional_id = :pid and m.role = 'assistant' and m.content like 'Marcado!%'
order by m.created_at desc limit 30;
