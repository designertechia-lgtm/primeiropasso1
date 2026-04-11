

## Upgrade: Bloqueios Recorrentes + Horarios de Atendimento na Agenda

### Resumo
1. **Disponibilidade** vira tela de **bloqueios recorrentes** (diario, semanal, quinzenal, selecionavel)
2. **Agenda** ganha as mesmas opcoes de recorrencia ao criar bloqueios + passa a exibir/gerenciar horarios de atendimento

### Passo 1: Migration -- adicionar campo `recurrence_group` na tabela `appointments`
Para agrupar bloqueios recorrentes (permitir deletar todos de uma vez):
```sql
ALTER TABLE appointments ADD COLUMN recurrence_group uuid DEFAULT NULL;
```

### Passo 2: Reescrever `AdminDisponibilidade.tsx` -- Tela de Bloqueios Recorrentes
- Remover logica de `availability` (slots por dia da semana)
- Nova interface com formulario de bloqueio:
  - Titulo, horario inicio/fim, tipo (pessoal, ferias, outro)
  - **Recorrencia**: select com opcoes `unico`, `diario`, `semanal`, `quinzenal`, `selecionavel`
  - **Data inicio** e **data fim** (definido pelo usuario) -- para diario/semanal/quinzenal
  - **Calendario multi-select** -- para modo "selecionavel" (usuario clica nos dias especificos)
- Ao salvar, gera N registros na tabela `appointments` (type=block) com o mesmo `recurrence_group` UUID
- Lista de bloqueios recorrentes existentes com opcao de deletar grupo inteiro

### Passo 3: Atualizar `AdminAgenda.tsx` -- Adicionar Recorrencia ao Dialog de Bloqueio
- No dialog "Bloquear horario", adicionar os mesmos campos de recorrencia:
  - Select: unico / diario / semanal / quinzenal / selecionavel
  - Campos de data fim ou calendario multi-select conforme opcao
- Ao confirmar, gera multiplos registros com `recurrence_group`
- No detalhe do bloqueio, opcao "Remover todos desta serie" (deleta pelo `recurrence_group`)

### Passo 4: Mover Horarios de Atendimento para a Agenda
- Adicionar secao ou botao na Agenda para gerenciar horarios de atendimento (tabela `availability`)
- Pode ser um painel lateral ou dialog que mostra os slots semanais atuais (mesma UI que existia em Disponibilidade)
- Os slots continuam aparecendo como eventos de fundo no calendario

### Passo 5: Atualizar Sidebar
- Manter "Disponibilidade" no menu mas com label "Bloqueios" (ou renomear)
- Ou manter o nome atual, ja que o conceito mudou

### Detalhes tecnicos
- **Geracao de datas**: funcao utilitaria que recebe data inicio, data fim, tipo de recorrencia e retorna array de datas
  - `diario`: todos os dias entre inicio e fim
  - `semanal`: mesmo dia da semana, a cada 7 dias
  - `quinzenal`: mesmo dia da semana, a cada 14 dias
  - `selecionavel`: datas escolhidas manualmente no calendario
- **Calendario multi-select**: usar `<Calendar mode="multiple" />` do shadcn (DayPicker)
- **Batch insert**: gera array de objetos e insere de uma vez via `supabase.from("appointments").insert([...])`
- **Deletar serie**: `supabase.from("appointments").delete().eq("recurrence_group", groupId)`

### Arquivos alterados
- Nova migration SQL (adicionar `recurrence_group`)
- `src/pages/admin/AdminDisponibilidade.tsx` (reescrita completa)
- `src/pages/admin/AdminAgenda.tsx` (dialog de bloqueio expandido + painel de horarios)
- `src/integrations/supabase/types.ts` (auto-atualizado)
- `src/components/dashboard/DashboardSidebar.tsx` (renomear item se necessario)

