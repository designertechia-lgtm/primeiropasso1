

## Plano: Refazer Agenda no formato Google Calendar

### Objetivo
Substituir a agenda atual (lista vertical de slots por dia) por uma visualização tipo Google Calendar com visões de semana e dia, onde eventos são posicionados visualmente por horário. Os dados continuarão vindo das mesmas tabelas (`appointments`, `schedule_blocks`, `availability`) e poderão ser alterados tanto pelo site quanto diretamente no Supabase (ex: via n8n).

### Abordagem
Usar a biblioteca **FullCalendar** (via `@fullcalendar/react`) que oferece visão semanal/diária idêntica ao Google Calendar, suporte a drag-and-drop, e renderização de eventos por horário. É a biblioteca padrão para esse tipo de UI em React.

### Estrutura da nova agenda

```text
┌──────────────────────────────────────────────┐
│  Agenda          [Hoje] [< >]  [Semana] [Dia]│
├──────────────────────────────────────────────┤
│        Seg   Ter   Qua   Qui   Sex           │
│ 07:00  ░░░   ░░░   ░░░   ░░░   ░░░           │
│ 08:00  ███   ░░░   ░░░   ███   ░░░           │
│ 09:00  ███   ░░░   ███   ███   ░░░           │
│ ...                                           │
│ ███ = evento (consulta/bloqueio)              │
│ ░░░ = disponível                              │
└──────────────────────────────────────────────┘
```

### Alterações

**1. Instalar dependências**
- `@fullcalendar/react`, `@fullcalendar/daygrid`, `@fullcalendar/timegrid`, `@fullcalendar/interaction`

**2. Reescrever `src/pages/admin/AdminAgenda.tsx`**
- Substituir todo o conteúdo por um componente FullCalendar com:
  - Visões `timeGridWeek` (padrão) e `timeGridDay`
  - Locale pt-BR
  - Horário visível: 07:00–21:00
  - Slot de 30 minutos
  - 3 fontes de eventos combinadas:
    - **Consultas** (`appointments`): cor primária, com nome do paciente e serviço
    - **Bloqueios** (`schedule_blocks`): cor vermelha/cinza, com título
    - **Disponibilidade** (`availability`): fundo verde claro como background events
  - Click em evento abre dialog com detalhes
  - Botão para adicionar bloqueio (mantém dialog existente)
  - Toolbar customizada com navegação e troca de visão

**3. Realtime (compatibilidade com fluxos externos)**
- Adicionar `supabase.channel()` para ouvir mudanças em tempo real nas tabelas `appointments` e `schedule_blocks`
- Quando houver INSERT/UPDATE/DELETE externo (ex: n8n), os eventos são recarregados automaticamente via `refetch()`
- Isso garante que a agenda reflita alterações feitas fora do site instantaneamente

**4. Estilização**
- CSS customizado para o FullCalendar usando as cores do tema (Tailwind + CSS variables)
- Eventos de consulta com cor primária do profissional
- Bloqueios em vermelho/cinza com padrão listrado
- Responsivo: em mobile mostra visão de dia por padrão

### O que NÃO muda
- Tabelas do banco de dados (mesmas 3 tabelas)
- Página de Disponibilidade (`AdminDisponibilidade`) permanece como está
- Página de Agendamentos (`AdminAgendamentos`) permanece como está
- RLS policies permanecem iguais

### Resultado
Uma agenda visual moderna idêntica ao Google Calendar, com atualização em tempo real para suportar alterações vindas de fluxos externos (n8n/Supabase direto).

