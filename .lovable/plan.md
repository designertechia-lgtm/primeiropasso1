

## Plan: Aplicar cores personalizadas na landing page do profissional

### Problema
As cores `primary_color` e `secondary_color` são salvas no banco de dados via AdminConfiguracoes, mas nunca são aplicadas como variáveis CSS na landing page. Os componentes continuam usando as cores padrão do tema.

### Solução
Converter as cores hex do profissional em valores HSL e aplicá-las como CSS custom properties no container da landing page, sobrescrevendo as variáveis do tema.

### Alteração

**Arquivo: `src/pages/ProfessionalLanding.tsx`**

1. Criar função auxiliar `hexToHSL` que converte hex (`#87A96B`) para o formato HSL sem `hsl()` (ex: `100 24% 53%`) usado pelas variáveis CSS do Tailwind.
2. No `div` raiz da landing page, aplicar `style` com as CSS custom properties `--primary` e `--secondary` usando os valores convertidos de `professional.primary_color` e `professional.secondary_color`.
3. Também derivar `--accent` a partir da primary color (com saturação/lightness ajustados) e `--ring` para manter consistência visual.

Resultado: todos os componentes que usam `bg-primary`, `text-primary`, `bg-secondary`, etc. automaticamente refletirão as cores escolhidas pelo profissional.

Nenhum outro arquivo precisa ser alterado.

