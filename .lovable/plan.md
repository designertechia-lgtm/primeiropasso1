

## Ajustes na Agenda: cores por status, campo de status para bloqueios, renomear "Bloqueio" para "Agendamento"

### O que muda

1. **Cores dos bloqueios na agenda seguem as cores de status** -- Atualmente bloqueios usam `BLOCK_TYPE_COLORS` (roxo, azul, laranja). Passarao a usar `getStatusColor(block.status)` para manter consistencia visual com a lista de agendamentos.

2. **Campo de status no detalhe do bloqueio** -- Ao clicar num bloqueio na agenda, adicionar botoes de alteracao rapida de status (Confirmar, Concluir, Cancelar) identicos aos que ja existem para consultas (linhas 743-761).

3. **Renomear "Bloqueio" para "Agendamento"** -- No dialog de detalhe, titulo do dialog, botoes e textos:
   - `"Bloqueio"` -> `"Agendamento"` (titulo do dialog, linha 709)
   - `"Bloquear horário"` -> `"Novo Agendamento"` (botao header, linha 550; titulo dialog criar, linha 588)
   - `"Confirmar bloqueio"` -> `"Confirmar agendamento"` (botao submit, linha 698)
   - `"Editar bloqueio"` -> `"Editar agendamento"` (botao editar, linha 802)
   - `"Remover este bloqueio"` -> `"Remover este agendamento"` (botao remover, linha 811)
   - Icone `Ban` no detalhe do bloqueio (linha 786) -> `CalendarIcon` ou remover

### Arquivo alterado
- `src/pages/admin/AdminAgenda.tsx`

### Detalhes tecnicos

**buildEvents** (linha 482-493): trocar `BLOCK_TYPE_COLORS[block.block_type]` por `getStatusColor(block.status || "pending")`.

**Detalhe do bloqueio** (linhas 783-826): adicionar badge de status + botoes de alteracao rapida de status (reutilizando `quickStatusChange` mutation que ja existe).

**Textos**: substituicoes de string conforme listado acima.

