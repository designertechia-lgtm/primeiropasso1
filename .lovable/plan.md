

## Cores para bloqueios + tipo "Atendimento" na Agenda

### O que muda

1. **Cores diferentes por tipo de bloqueio** -- Atualmente todos os bloqueios usam vermelho fixo (`destructive`). Vamos dar cor distinta para cada tipo:
   - Pessoal: cinza/roxo
   - Atendimento: azul/verde
   - Ferias/Folga: laranja
   - Outro: cinza

2. **Adicionar tipo "Atendimento"** no select de Tipo (tanto no dialog de criar bloqueio quanto no de editar):
   - Pessoal
   - Atendimento
   - Ferias / Folga
   - Outro

3. **Cores dos bloqueios no calendario** -- No `buildEvents`, usar cor baseada no `block_type` ao inves de vermelho fixo

### Arquivos alterados
- `src/pages/admin/AdminAgenda.tsx`:
  - Adicionar constante `BLOCK_TYPE_COLORS` com cores por tipo
  - No `buildEvents`, usar `BLOCK_TYPE_COLORS[block.block_type]` ao inves de `hsl(var(--destructive))`
  - Adicionar `<SelectItem value="appointment">Atendimento</SelectItem>` nos selects de tipo (criar e editar)
  - Mostrar badge de tipo com cor no detalhe do bloqueio

Nenhuma migration necessaria -- o campo `block_type` ja e texto livre.

