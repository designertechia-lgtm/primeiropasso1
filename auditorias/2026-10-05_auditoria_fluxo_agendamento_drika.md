# Auditoria — fluxo de agendamento da Drika (Axel no WhatsApp) — 2026-10-05

**Escopo:** do primeiro "oi" até o pós-atendimento — `whatsapp-webhook` → `whatsapp-agent` (ferramentas de
agenda) → lembretes 24h/1h (`send-appointment-reminder` + cron) → resposta ao lembrete → pesquisa de
satisfação (`send-satisfaction-survey` + cron) → auto-conclusão.
**Objetivo:** qualidade dos agendamentos e satisfação da cliente (a profissional) e dos pacientes dela.

> ⚠️ **Limite desta auditoria:** foi feita no claude.ai/code com a rede bloqueando `api.supabase.com` e
> `*.supabase.co`, e sem `SUPABASE_PP_REF`/`SUPABASE_PP_TOKEN` no ambiente. Por isso **a causa-raiz de
> cada achado está provada no código (arquivo:linha + mecanismo), mas a prova material no dado real da
> Drika ainda NÃO foi feita.** As consultas prontas estão em
> [`auditorias/sql/2026-10-05_prova_material_agendamento.sql`](sql/2026-10-05_prova_material_agendamento.sql)
> e o caso só fecha depois de rodá-las (antes/depois). Nada foi deployado.

---

## Achados corrigidos (causa-raiz no mecanismo)

### F1 — Remarcar/cancelar agiam no agendamento ERRADO (alta)
- **Mecanismo:** `getActiveAppointment` fazia `status in (pending, confirmed)` + `order(appointment_date ASC)` +
  `limit(1)` **sem filtro de data** → devolvia o **mais antigo**. O agente grava agendamento como
  `pending` e o `auto_complete_appointments` (migração `20260802b`) só conclui `confirmed`. Toda sessão em
  que o paciente não tocou "Confirmar" fica `pending` **para sempre** — e vira o "agendamento ativo".
- **Efeito:** paciente recorrente com uma sessão passada pendente + a de quinta:
  - "preciso desmarcar quinta" → cancelava a **sessão velha**, respondia "Pronto, cancelei" e a de quinta
    **continuava na agenda** (falta / horário perdido da Drika);
  - "remarca pra sexta 10h" → **movia a sessão velha** pra sexta e a de quinta continuava → paciente com
    dois horários, agenda da Drika com fantasma.
- O mesmo padrão já tinha sido corrigido nas travas C2 (`getUpcomingAppointment`), mas remarcar/cancelar
  ficaram no helper antigo. Clássico `ascending + limit`.
- **Agravante confirmado no código do painel** (`src/pages/admin/AdminAgendaCalendario.tsx:661-683`): o
  atendimento criado pela profissional nasce `pending`, com `lead_id`, e o painel cria **séries recorrentes**
  (`recurrence_group`). Paciente semanal = várias sessões futuras + todas as passadas que nunca foram
  confirmadas pelo botão ficam `pending`. É exatamente o perfil exposto ao F1. As notas do atendimento
  (`notes: blockTitle`) eram sobrescritas pelo cancelamento.
- **Fix:** remarcar/cancelar usam os agendamentos **futuros** (`getUpcomingAppointments`); com mais de um, a
  ferramenta **não chuta** — devolve a lista e o agente pergunta qual (novo parâmetro opcional `data_atual`).
  O cancelamento passa a **acrescentar** o motivo às notas (antes sobrescrevia o que a Drika anotou no painel).

### F2 — Remarcação aceitava feriado e dia sem atendimento (média)
- **Mecanismo:** `criar_agendamento` valida com `isSlotFree` (passado, almoço, feriado/data fechada, dia da
  semana fechado, conflito com folga). `remarcar_agendamento` só olhava almoço + conflito em `rescheduleBooking`.
- **Fix:** remarcar usa o mesmo `isSlotFree` (com `excludeId` = o próprio agendamento); na recusa devolve os
  horários livres REAIS do dia (como o criar); trata `23505` (corrida no `unique_appointment_slot`).

### F3 — "Remarcar" virava beco sem saída (alta para satisfação)
- **Mecanismo:** a trava C2 bloqueava `abrir_agenda` sempre que havia agendamento futuro. Quem tocava
  **Remarcar** no lembrete e perguntava "que horários tem sexta?" recebia "você já está marcado". A recusa do
  remarcar mandava "pergunte se quer um dos horários livres", mas não entregava lista nenhuma.
- **Fix:** `abrir_agenda(data)` com agendamento ativo agora lista os livres **daquele dia para a troca**
  (estado `choosing_reschedule_time`, sem apagar o agendamento atual) e orienta `remarcar_agendamento`.
  **Sem data continua travado** (o loop pós-confirmação do C2 não volta). Novo bloco "REMARCAÇÃO EM CURSO"
  no prompt faz o "14h" seguinte virar `remarcar`, nunca `criar`.

### F4 — O prompt contradizia o banco (alta)
- **Mecanismo:** o estado "JÁ TEM AGENDAMENTO" vinha só de `leads.booking_state`, que só o agente escreve.
  - Horário marcado pela Drika **no painel** → invisível pro agente.
  - Cancelado pelo lembrete → o webhook só mudava `stage`, não `status` → o prompt seguia dizendo
    "confirme que SIM, está agendado" para um horário **cancelado**.
  - Sessão já realizada → seguia "JÁ TEM AGENDAMENTO".
- **Fix:** a cada turno o estado de agenda do prompt é montado a partir da tabela `appointments` (próximo
  futuro + os demais). Só leitura — nada é gravado.

### F5 — Lembrete: "Confirmar" do paciente se perdia (alta)
- **Mecanismo (webhook 3.35):** buscava os **5 lembretes mais recentes da plataforma inteira** nas últimas
  **6h** (sem filtro de profissional, lead ou tipo) e só depois procurava o do lead pelo `booking_state`.
  Falhava quando: (a) mais de 5 lembretes saíam na mesma janela; (b) o paciente respondia 6h+ depois (lembrete
  às 15h, resposta às 22h); (c) o agendamento era do painel (sem `booking_state`). Aí o "Confirmar" ia pro
  LLM, o status ficava `pending` e o horário nunca era auto-concluído — o que **alimenta o F1**.
  Sem filtro de `kind`, também podia casar a pesquisa de satisfação.
- **Fix:** casa só lembretes 24h/1h sem resposta dos agendamentos **futuros deste lead**
  (`appointments.lead_id` OU `booking_state.appointment_id`), enviados nas últimas 26h.

### F6 — Resposta ao lembrete com data crua e estado errado (baixa)
- "Te espero 2026-10-09 às 15:00" → "Presença confirmada: quinta-feira, 09/10 às 15:00 com Drika ✅".
- Cancelar pelo lembrete grava `booking_state.status='cancelled'` (era o que o prompt lia).

### F7 — "Bom dia" virava nota de satisfação (média)
- **Mecanismo:** o texto casava pelo **começo** (`/^bom\b/`). Com pesquisa pendente (até 24h depois da
  sessão), "Bom dia, queria marcar a próxima" registrava nota **bom**, **zerava o booking_state** e respondia
  "Que bom que você gostou!" em vez de atender. Corrompia a métrica e a conversa.
- **Fix:** só vale a resposta que **é** a opção (pontuação/emoji do fim ignorados); a pesquisa pendente é
  achada pelos atendimentos recentes do lead.

### F8 — Atendimento do painel nunca recebia pesquisa (média)
- `send-satisfaction-survey` achava o lead só por `booking_state`; agora usa `appointments.lead_id` primeiro
  (mesmo padrão que o `send-appointment-reminder` já usava).
- ⚠️ **Mudança visível:** pacientes agendados pela Drika no painel passam a receber a pesquisa (respeita o
  liga/desliga `satisfaction` das preferências do agente).

### F9 — Lembretes sumiam depois de remarcar (média)
- **Mecanismo:** o cron deduplica por `(appointment_id, kind)`. Remarcar mantém o mesmo id → o registro do
  lembrete do horário antigo impedia o 24h/1h do horário **novo**. Fluxo típico: lembrete → "Remarcar" →
  nova data → **nenhum lembrete**.
- **Fix:** `rescheduleBooking` apaga os registros 24h/1h daquele agendamento ao remarcar.
- 🔶 Remarcação feita **pelo painel** tem o mesmo problema (fora do escopo das edges — ver plano).

### F10 — "Dia errado": o prompt não sabia o dia da semana (alta, 🔶)
- **Mecanismo:** `HOJE:` era `toLocaleString` → "05/10/2026, 11:22", **sem dia da semana**. "Quinta às 15h"
  vai direto pro `criar_agendamento(data, hora)` com a data que o LLM calculou de cabeça.
- **Fix:** `HOJE: domingo, 05/10/2026, 11:22 (horário de Brasília)` + tabela dos próximos 14 dias
  (`qui 09/10 = 2026-10-09`). A conta sai do LLM e vira consulta a uma tabela.

### F11 — Rajada duplicada no histórico (baixa)
- O webhook junta a rajada num texto só; o agente tirava do histórico só a **última** mensagem
  (`slice(0,-1)`) → numa rajada de 3, as 2 primeiras iam duplicadas pro LLM. Agora tira todas as do lead que
  já estão no texto do turno.

### Confirmação mais completa (melhoria)
- "Marcado! ✅ Sessão X com Drika: quinta-feira, 09/10 às 15:00." + `📍 endereço` quando o atendimento é só
  presencial. Sai o "Te espero" (quem fala é o Axel, não a profissional).

---

## Laudo de prontidão

| Item | Garantia |
|---|---|
| F1 remarcar/cancelar no agendamento futuro certo; ambíguo pergunta | ✅ código |
| F2 mesma validação do criar na remarcação | ✅ código |
| F3 lista de horários pra remarcar | ✅ código (a ferramenta) · 🔶 o LLM chamar `abrir_agenda(data)` e depois `remarcar` |
| F4 prompt fiel ao banco | ✅ código |
| F5/F6 resposta ao lembrete casa e muda status | ✅ código |
| F7 "Bom dia" não vira nota | ✅ código |
| F8 pesquisa para agendamento do painel | ✅ código |
| F9 lembrete re-arma após remarcar (pelo WhatsApp) | ✅ código · 🔶 remarcação pelo painel ainda não |
| F10 data certa a partir de "quinta" | 🔶 prompt — melhora forte, mas depende do LLM ler a tabela |
| F11 histórico sem duplicata | ✅ código |
| Prova material no dado da Drika | ❌ **pendente** (sem acesso ao banco nesta sessão) |
| Deploy | ❌ **pendente** (3 edges: `whatsapp-agent`, `whatsapp-webhook`, `send-satisfaction-survey`) |

**Segurança:** nenhum caminho de crise foi alterado (os dois detectores de risco + CVV seguem
determinísticos, antes de qualquer LLM).

## Decisões que são da Drika/produto (não mexi)
- **R1 — Expediente:** o modelo "agenda por bloqueio" aceita **qualquer** horário livre num dia aberto
  (ex.: 22h, 6h) se o paciente pedir direto, mesmo fora das janelas cadastradas. Consulta 5 do SQL mostra
  se já aconteceu. Se a Drika não quer isso, a régua vira "dentro da janela de availability".
- **R2 — Serviços:** o agente sempre usa o **1º serviço ativo** (duração e nome). Se a Drika tem mais de um
  (ex.: Descoberta 30 min × Sessão 60 min), a duração sai errada. Consulta 6.
- **R3 — Aviso à Drika:** ela não recebe nada no WhatsApp quando um paciente **marca, remarca ou cancela**
  pelo Axel (só em crise/handoff). Aviso de cancelamento é o de maior valor (libera o horário).
- **R4 — Mensagens da própria Drika:** quando ela responde o paciente pelo celular, o webhook ignora
  (`fromMe` sem `#`) — o Axel não vê o que ela combinou e pode contradizê-la ou responder junto.
- **R5 — "inativo" indevido:** a parte B do cron de satisfação marca o lead como `inativo` 24h depois de
  pesquisa sem resposta, mesmo com sessão futura marcada — e o webhook deixa de mandá-lo como
  `contact_status='cliente'` (o Axel volta a reapresentar o trabalho pra uma paciente antiga).
