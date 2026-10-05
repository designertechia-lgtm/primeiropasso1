# Plano — fluxo de agendamento da Drika — 2026-10-05

Auditoria: [`auditorias/2026-10-05_auditoria_fluxo_agendamento_drika.md`](../auditorias/2026-10-05_auditoria_fluxo_agendamento_drika.md)

## 1. Antes do deploy — prova material (o "antes")
Rodar `auditorias/sql/2026-10-05_prova_material_agendamento.sql` (consulta 0 → pegar o `id` da Drika →
trocar `:pid`) e guardar os resultados:
- [ ] 1/1b/1c/1d — sessões passadas `pending`, leads expostos ao F1 e dano já causado (cancelamento de sessão
      passada com a futura de pé). **Cada linha de 1c é uma paciente que ouviu "cancelei" e não foi
      cancelada — avisar a Drika.**
- [ ] 2/2b/2c — taxa de resposta capturada dos lembretes; "Confirmar" que caiu no LLM.
- [ ] 3/3b — notas de satisfação vindas de "Bom dia…"; atendimentos do painel sem pesquisa.
- [ ] 4 — horários em feriado/dia sem atendimento.
- [ ] 5/6 — insumos das decisões R1 (fora do expediente) e R2 (serviços).
- [ ] 7 — leitura humana das últimas 30 confirmações: o dia marcado é o dia que o paciente pediu?

## 2. Deploy (máquina local, precisa do token)
```
deno check supabase/functions/whatsapp-agent/index.ts
deno check supabase/functions/whatsapp-webhook/index.ts
deno check supabase/functions/send-satisfaction-survey/index.ts
py c:/tmp/deploy_function.py whatsapp-agent
py c:/tmp/deploy_function.py whatsapp-webhook
py c:/tmp/deploy_function.py send-satisfaction-survey
```
Sem migração de banco nesta rodada.

## 3. Validação ao vivo (número de teste, não a agenda da Drika)
- [ ] Lead com 1 sessão passada `pending` + 1 futura → "desmarca a de <dia>" cancela a FUTURA; notas preservadas.
- [ ] Lead com 2 futuras → "cancela" sem dizer qual → Axel pergunta qual.
- [ ] Lembrete 24h → "Remarcar" → "que horários tem <dia>?" → lista do dia → "14h" → remarcado; o lembrete
      24h/1h sai de novo pro horário novo.
- [ ] Remarcar pra feriado / dia sem atendimento → recusa com horários livres.
- [ ] Agendamento criado no painel → "Confirmar" no lembrete → status `confirmed` + resposta com data legível;
      "meu horário tá certo?" → Axel confirma o horário do painel.
- [ ] Pesquisa pendente + "Bom dia, queria marcar" → vai pro Axel (não vira nota).
- [ ] Domingo: "pode ser quinta às 15h" → marca a quinta certa.
- [ ] Rajada "oi / quero marcar / quinta 15h" → uma resposta, sem eco.

## 4. Depois do deploy — prova material (o "depois")
Repetir as consultas 1, 2, 2b e 3 após ~1 semana e comparar com o "antes" (taxa de captura de
"Confirmar" ↑; novas linhas em 1c = 0; notas vindas de "Bom dia" = 0).

## 5. Decisões pendentes (perguntar à Drika / produto)
- [ ] **R1** Aceitar horário fora do expediente cadastrado quando o paciente pede direto? (hoje: aceita)
- [ ] **R2** Ela tem mais de um serviço com durações diferentes? → ferramenta ganha parâmetro de serviço.
- [ ] **R3** Quer aviso no WhatsApp (número autorizado) quando um paciente marca/remarca/cancela?
- [ ] **R4** Registrar as mensagens que ela manda pelo celular no histórico do Axel (e pausar o Axel quando
      ela assume a conversa)? Exige distinguir eco do próprio bot (`fromMe`) da mensagem manual.
- [ ] **R5** Cron de satisfação (parte B): não marcar `inativo` quem tem sessão futura → migração SQL.
- [ ] **F9-painel** Remarcar pelo painel também deve re-armar os lembretes (trigger em `appointments` ao mudar
      data/hora, apagando `appointment_reminders` 24h/1h) → migração SQL.
