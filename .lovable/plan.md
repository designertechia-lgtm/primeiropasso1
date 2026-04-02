

## Plan: Agenda unificada do profissional (pessoal + profissional)

### Problema
Atualmente a página de disponibilidade (`AdminDisponibilidade`) só permite definir horários recorrentes por dia da semana. Não há como o profissional bloquear datas/horários específicos (compromissos pessoais, férias, etc.), e a visualização é uma lista, não uma agenda visual.

### Alterações

**1. Migração SQL** -- Criar tabela `schedule_blocks` para bloqueios pontuais:
```sql
CREATE TABLE public.schedule_blocks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  professional_id uuid NOT NULL REFERENCES professionals(id) ON DELETE CASCADE,
  block_date date NOT NULL,
  start_time time NOT NULL,
  end_time time NOT NULL,
  title text DEFAULT 'Bloqueado',
  block_type text NOT NULL DEFAULT 'personal', -- 'personal' | 'vacation' | 'other'
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.schedule_blocks ENABLE ROW LEVEL SECURITY;

-- Profissional gerencia seus próprios bloqueios
CREATE POLICY "Professionals can manage own blocks" ON public.schedule_blocks
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM professionals p WHERE p.id = schedule_blocks.professional_id AND p.user_id = auth.uid()));

-- Bloqueios visíveis publicamente (para pacientes saberem que o horário está ocupado)
CREATE POLICY "Blocks are viewable by everyone" ON public.schedule_blocks
  FOR SELECT USING (true);
```

**2. Nova página: `src/pages/admin/AdminAgenda.tsx`** -- Agenda visual do profissional com calendário:
- Visualização por dia/semana com calendário lateral para navegar
- Mostra em cores diferentes: agendamentos de pacientes (azul), bloqueios pessoais (cinza/vermelho), horários livres (verde)
- Botão para adicionar bloqueio pessoal em um dia/horário (modal com título, data, horário início/fim, tipo)
- Botão para remover bloqueio existente
- Os horários recorrentes da tabela `availability` continuam como base; os `schedule_blocks` são subtrações pontuais

**3. Atualizar `src/pages/paciente/PatientAgendar.tsx`** -- Considerar bloqueios:
- Ao gerar os time slots disponíveis, além de verificar conflitos com `appointments`, também verificar conflitos com `schedule_blocks` do profissional naquela data
- Horários bloqueados não aparecem como opção

**4. Atualizar sidebar e rotas:**
- Adicionar item "Agenda" no `DashboardSidebar` (ícone CalendarDays) apontando para `/admin/agenda`
- Adicionar rota em `App.tsx`

### Fluxo
```text
Profissional abre "Agenda"
  → Vê calendário com dia selecionado
  → Cada dia mostra:
      - Slots livres (baseados em availability - blocks - appointments)
      - Agendamentos confirmados/pendentes (da tabela appointments)
      - Bloqueios pessoais (da tabela schedule_blocks)
  → Pode clicar "+" para bloquear horário (ex: "Dentista 14:00-15:00")
  → Pode remover bloqueio clicando no "x"

Paciente agenda consulta
  → Slots bloqueados não aparecem como disponíveis
```

### Resultado
O profissional tem uma agenda unificada visual, pode bloquear horários específicos para compromissos pessoais, e os pacientes só veem horários realmente livres.

