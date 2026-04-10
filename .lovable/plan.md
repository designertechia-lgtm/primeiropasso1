

## Unificar bloqueios e agendamentos em uma única tabela

### Problema atual
Os horários bloqueados (`schedule_blocks`) e os agendamentos (`appointments`) ficam em tabelas separadas, dificultando a gestão centralizada.

### Solução
Migrar os bloqueios para a tabela `appointments` usando um novo campo `appointment_type` para diferenciar agendamentos de bloqueios.

### Passo 1: Migração do banco de dados
- Adicionar coluna `appointment_type` na tabela `appointments` (valores: `'booking'` ou `'block'`, default `'booking'`)
- Adicionar coluna `block_type` (text, nullable) para o tipo de bloqueio (personal, etc.)
- Tornar `patient_id` nullable (bloqueios não têm paciente)
- Atualizar a policy RLS de INSERT para permitir bloqueios sem patient_id
- Migrar dados existentes de `schedule_blocks` para `appointments`

### Passo 2: Atualizar a Agenda do Admin (`AdminAgenda.tsx`)
- Remover query e realtime de `schedule_blocks`
- Inserir/deletar bloqueios na tabela `appointments` com `appointment_type = 'block'`
- Separar visualmente bloqueios e agendamentos usando o campo `appointment_type`

### Passo 3: Atualizar páginas do paciente (`PatientAgendar.tsx`, `PatientBuscar.tsx`)
- Substituir query de `schedule_blocks` por filtro em `appointments` onde `appointment_type = 'block'`

### Passo 4: Atualizar lista de agendamentos do paciente (`PatientAgendamentos.tsx`)
- Filtrar apenas `appointment_type = 'booking'` para não exibir bloqueios ao paciente

### Passo 5: Atualizar RLS policies
- Adicionar policy para profissionais criarem bloqueios (INSERT sem patient_id)
- Adicionar policy para profissionais deletarem bloqueios próprios

### Detalhes técnicos
- Nova coluna: `appointment_type TEXT NOT NULL DEFAULT 'booking'`
- Nova coluna: `block_type TEXT` (nullable)
- `patient_id` passa a ser nullable
- Dados existentes em `schedule_blocks` são copiados como appointments com `appointment_type = 'block'`, `status = 'confirmed'`
- A tabela `schedule_blocks` será mantida temporariamente (pode ser removida depois)
- 4 arquivos de código alterados: `AdminAgenda.tsx`, `PatientAgendar.tsx`, `PatientBuscar.tsx`, `PatientAgendamentos.tsx`

