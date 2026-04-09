

## Plano: Auto-preencher horário de fim baseado na duração do serviço

### O que muda
Quando o profissional clicar ou selecionar um horário na agenda, o horário de fim será calculado automaticamente com base na duração do serviço (ex: serviço de 60min, clica às 9:00 → preenche 9:00–10:00).

### Alterações em `src/pages/admin/AdminAgenda.tsx`

1. **Buscar serviços do profissional** — adicionar query em `professional_services` para obter a duração padrão (ex: 50 ou 60 minutos)

2. **Ajustar `snapDuration`** — mudar de 30min para 15min, permitindo seleções como 8:15, 9:15, etc.

3. **Recalcular `end_time` no `handleDateSelect`** — ao invés de usar o fim do drag, calcular: `end = start + duração do serviço`. Se o profissional tiver múltiplos serviços, usar a duração do primeiro serviço ativo como padrão (editável no dialog)

4. **No dialog de bloqueio** — o campo "Fim" já virá preenchido automaticamente mas continua editável

### Resultado
Clicou às 9:15 com serviço de 60min → aparece 9:15–10:15 automaticamente. Simples e prático.

