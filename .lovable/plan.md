

## Correções: Lista de Agendamentos + Cores da Agenda

### Problemas identificados

1. **Lista de Agendamentos mostra bloqueios como "Paciente"** -- A query não filtra por `appointment_type = 'booking'`, então bloqueios aparecem na lista. Na coluna "Paciente" deveria mostrar o tipo do bloqueio (Pessoal, Atendimento, etc.) ou simplesmente filtrar bloqueios fora da lista.
2. **Coluna "Serviço" mostra "—" para bloqueios** -- Deveria mostrar a descrição/notas do bloqueio.
3. **Cores dos cards na Agenda não acompanham as cores da lista** -- Já estão usando `getStatusColor` em ambos, mas o pedido é garantir consistência visual.

### Solução

**Arquivo: `src/pages/admin/AdminAgendamentos.tsx`**

1. Filtrar a query para mostrar apenas `appointment_type = 'booking'` (agendamentos reais), removendo bloqueios da lista. Ou, alternativamente, manter bloqueios mas:
   - Na coluna "Paciente": mostrar o tipo do bloqueio (ex: "Pessoal", "Atendimento") usando `BLOCK_TYPE_LABELS` quando `appointment_type === 'block'`
   - Na coluna "Serviço": mostrar `appt.notes` (descrição do bloqueio) ao invés de "—"

A abordagem mais limpa é **filtrar bloqueios fora da lista** adicionando `.eq("appointment_type", "booking")` na query, já que bloqueios são gerenciados na Agenda. Os cards de contagem também devem contar apenas bookings.

**Arquivo: `src/pages/admin/AdminAgenda.tsx`**

As cores dos eventos no calendário já usam `getStatusColor(appt.status)` (linha 475), que é a mesma lógica da lista. Estão consistentes. Se a percepção do usuário é que são diferentes, pode ser porque os bloqueios usam cores de `BLOCK_TYPE_COLORS` (roxo, azul, etc.) que não coincidem com as cores de status -- isso é correto pois são tipos diferentes.

### Arquivos alterados
- `src/pages/admin/AdminAgendamentos.tsx`: adicionar filtro `.eq("appointment_type", "booking")` na query para excluir bloqueios da lista

