

## Cores personalizaveis + Mudanca rapida de status na Agenda

### Resumo
1. Adicionar cores dinamicas para cada status de agendamento e pagamento
2. Profissional pode personalizar as cores em Configuracoes
3. Botoes rapidos de status no detalhe do evento (sem precisar entrar em "Editar")

### Passo 1: Migration -- colunas de cores na tabela `professionals`
```sql
ALTER TABLE professionals
  ADD COLUMN color_status_pending text DEFAULT '#EAB308',
  ADD COLUMN color_status_confirmed text DEFAULT '#22C55E',
  ADD COLUMN color_status_completed text DEFAULT '#3B82F6',
  ADD COLUMN color_status_cancelled text DEFAULT '#EF4444',
  ADD COLUMN color_payment_pending text DEFAULT '#F97316',
  ADD COLUMN color_payment_paid text DEFAULT '#10B981';
```

### Passo 2: Atualizar `AdminAgenda.tsx`
- Substituir `STATUS_COLORS` fixo por cores do `professional` (com fallback para defaults)
- No dialog de detalhe do agendamento (modo visualizacao, sem editMode), adicionar:
  - Badge de status com a cor correspondente (ja existe, so mudar para cor dinamica)
  - Badge de pagamento (pendente/pago) com cor correspondente
  - **Botoes rapidos de status**: uma linha de botoes (Confirmar, Concluir, Cancelar) que mudam o status com um clique, sem abrir o formulario de edicao
  - **Botao rapido de pagamento**: toggle pago/pendente
- No modo edicao, adicionar select para `payment_status`
- Cores dos eventos no calendario refletem as cores personalizadas

### Passo 3: Atualizar `AdminAgendamentos.tsx`
- Usar cores dinamicas do profissional nos badges de status e pagamento

### Passo 4: Atualizar `AdminConfiguracoes.tsx`
- Nova secao "Cores dos Status" com 6 inputs `type="color"`:
  - Pendente, Confirmado, Concluido, Cancelado
  - Pagamento Pendente, Pagamento Pago
- Preview dos badges com as cores escolhidas
- Salvar nas colunas da tabela `professionals`

### Passo 5: Atualizar `types.ts`
- Atualizado automaticamente apos migration

### Detalhes dos botoes rapidos de status (Passo 2)
Na visualizacao do evento (sem editMode), apos o badge de status atual, renderizar:
```
[Confirmar] [Concluir] [Cancelar]   [Marcar Pago / Marcar Pendente]
```
- Cada botao chama uma mutation simples que faz UPDATE apenas do campo `status` ou `payment_status`
- O botao do status atual fica desabilitado/destacado
- Nao e dificil de manter pois sao mutations independentes e simples

### Arquivos alterados
- Nova migration SQL (colunas de cores)
- `src/pages/admin/AdminAgenda.tsx` (cores dinamicas + botoes rapidos de status/pagamento)
- `src/pages/admin/AdminConfiguracoes.tsx` (secao de cores)
- `src/pages/admin/AdminAgendamentos.tsx` (cores dinamicas)
- `src/integrations/supabase/types.ts` (auto)

