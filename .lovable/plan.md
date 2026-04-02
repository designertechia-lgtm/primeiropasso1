
## Plan: Cores personalizadas opcionais para modo escuro

### Problema
Quando o modo escuro está ativo, as cores do tema claro são usadas diretamente. O profissional deveria poder, opcionalmente, escolher cores diferentes para o modo escuro (primária, secundária e fundo).

### Alterações

**1. Migração SQL** -- Adicionar 3 colunas na tabela `professionals`:
```sql
ALTER TABLE public.professionals
  ADD COLUMN dark_primary_color text,
  ADD COLUMN dark_secondary_color text,
  ADD COLUMN dark_background_color text;
```
Todas nullable, sem default. Quando `null`, a landing page usará as cores do modo claro.

**2. `src/pages/admin/AdminConfiguracoes.tsx`**
- Adicionar estados `darkPrimaryColor`, `darkSecondaryColor`, `darkBackgroundColor`
- Quando `darkMode` estiver ativo, mostrar um card adicional "Cores do Modo Escuro" com 3 color pickers (mesma UX dos existentes): Cor Primária Escura, Cor Secundária Escura, Cor de Fundo Escura
- Cada campo terá um placeholder/hint indicando que é opcional (usa a cor do modo claro se vazio)
- Permitir limpar o campo (botão "Usar padrão" ou deixar vazio)
- No `handleSave`, incluir os 3 novos campos

**3. `src/pages/ProfessionalLanding.tsx`**
- Quando `dark_mode` está ativo e existem cores escuras definidas, usar `dark_primary_color` em vez de `primary_color` (e assim para secondary e background)
- Fallback: se a cor escura for `null`, usar a cor clara correspondente

**4. `src/integrations/supabase/types.ts`**
- Atualizado automaticamente pela migração

### Resultado
O toggle de modo escuro continua funcionando. Se o profissional quiser, pode customizar as cores específicas do dark mode. Se não configurar, usa as cores normais.
