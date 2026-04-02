

## Plan: Horários livres sem depender de disponibilidade configurada

### Problema
Atualmente, a agenda do profissional e a tela de agendamento do paciente só mostram slots se houver registros na tabela `availability`. O usuário quer que todo horário entre 07:00–20:00 seja considerado livre, a menos que já exista uma reserva (appointment) ou bloqueio (schedule_block).

### Alterações

**1. `src/pages/admin/AdminAgenda.tsx`** — `buildTimeline()`:
- Remover dependência da tabela `availability` para gerar a timeline
- Usar faixa padrão 07:00–20:00 para todos os dias
- Continuar verificando appointments e schedule_blocks para marcar slots como ocupados/bloqueados
- Remover a mensagem "Sem horários configurados para este dia da semana"

**2. `src/pages/paciente/PatientAgendar.tsx`** — `getTimeSlots()`:
- Se não houver registros em `availability` para o dia, usar faixa padrão 07:00–20:00
- Manter a lógica existente de conflito com appointments e schedule_blocks
- Habilitar todos os dias da semana no calendário (remover `disableDate` baseado em `availableDays`)

### Resultado
Profissional vê a agenda completa 07:00–20:00 todo dia, com slots livres, agendamentos e bloqueios. Paciente pode agendar em qualquer dia/horário livre, sem depender de configuração prévia de disponibilidade.

