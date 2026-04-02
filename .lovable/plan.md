

## Plan: Adicionar cor de background e modo escuro na landing page

### Problema
Atualmente o profissional pode escolher cor primária e secundária, mas não a cor de fundo (background). Além disso, não há opção de ativar modo escuro na landing page.

### Alterações

**1. Migração SQL** -- Adicionar 2 colunas na tabela `professionals`:
```sql
ALTER TABLE public.professionals
  ADD COLUMN background_color text DEFAULT '#F5F0EB',
  ADD COLUMN dark_mode boolean DEFAULT false;
```

**2. `src/pages/admin/AdminConfiguracoes.tsx`**
- Adicionar estado `backgroundColor` e `darkMode`
- No card "Cores", adicionar seletor de cor para "Cor de Fundo" (color picker + input hex, mesmo padrão existente)
- Adicionar um switch (toggle) com label "Modo Escuro" para ativar/desativar o tema dark na landing page
- No `handleSave`, incluir `background_color` e `dark_mode` no update

**3. `src/pages/ProfessionalLanding.tsx`**
- No `customStyles`, converter `background_color` hex para HSL e aplicar como `--background`
- Derivar também `--card`, `--muted`, `--border` e `--foreground` a partir da cor de fundo para manter consistência
- Se `dark_mode` estiver ativo, adicionar a classe `dark` ao container raiz da landing page, ativando automaticamente as variáveis do tema escuro já definidas no CSS
- Quando `dark_mode` está ativo e `background_color` é customizada, aplicar as variáveis sobre o tema dark

**4. `src/integrations/supabase/types.ts`**
- Será atualizado automaticamente pela migração

### Resultado
O profissional poderá escolher a cor de fundo da landing page e ativar o modo escuro com um simples toggle nas configurações.

