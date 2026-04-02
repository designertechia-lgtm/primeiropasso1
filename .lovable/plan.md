

## Plan: Revisar cores de texto (foreground) no modo claro e escuro

### Problema
O `customStyles` no `ProfessionalLanding.tsx` define `--foreground` e `--muted-foreground` mas não define variáveis derivadas essenciais como `--primary-foreground`, `--secondary-foreground`, `--card-foreground`, `--accent-foreground`, `--popover` e `--popover-foreground`. Isso causa problemas de contraste:

- Botões `bg-primary` com `text-primary-foreground` podem ficar ilegíveis (texto escuro em fundo escuro ou claro em claro)
- Cards e popovers herdam foreground errado
- O footer usa `bg-foreground text-background` (inversão) que pode quebrar visualmente
- Quando `dark_mode` está ativo sem cores escuras customizadas, as inline styles sobrescrevem as variáveis `.dark` do CSS com valores calculados a partir das cores claras, anulando o tema escuro

### Alterações

**Arquivo: `src/pages/ProfessionalLanding.tsx`** -- Completar as variáveis CSS derivadas no `customStyles`:

1. Adicionar `--primary-foreground` calculado automaticamente: se a primary color for clara (l > 55%), usar foreground escuro; se escura, usar foreground claro
2. Adicionar `--secondary-foreground` com a mesma lógica de contraste
3. Adicionar `--accent-foreground` derivado do accent
4. Adicionar `--card-foreground` igual ao `--foreground`
5. Adicionar `--popover` e `--popover-foreground` alinhados com card
6. Quando `dark_mode` está ativo e **nenhuma** cor escura customizada é definida, **não** sobrescrever as variáveis de background/foreground com inline styles -- deixar o CSS `.dark` atuar sozinho; apenas sobrescrever `--primary`, `--secondary`, `--accent` e `--ring`

**Arquivo: `src/components/landing/LandingFooter.tsx`** -- O footer usa `bg-foreground text-background` para inverter cores. Isso funciona bem no modo claro, mas pode quebrar no escuro. Trocar para usar classes temáticas mais robustas: `bg-card text-card-foreground` com borda, ou manter a inversão mas garantir que `text-background/70` use a variável correta.

### Resultado
Textos legíveis em ambos os modos, botões com contraste adequado, e o toggle de modo escuro funcionando corretamente mesmo quando o profissional não define cores escuras customizadas.

