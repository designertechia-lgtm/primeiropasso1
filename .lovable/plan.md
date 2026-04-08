

## Plano: Simplificar para 1 cor — derivar as outras automaticamente

### O que muda
O profissional escolhe apenas a **cor primária**. A cor secundária e a cor de fundo são calculadas automaticamente por paleta harmônica (mesma lógica para modo claro e escuro).

### Algoritmo de derivação
A partir da cor primária (H, S, L):
- **Secundária**: matiz rotacionado +30°, saturação reduzida 40%, luminosidade +15% (tom terroso complementar)
- **Fundo**: mesmo matiz, saturação muito baixa (10-15%), luminosidade alta 93-95% (claro) ou 10-12% (escuro)

### Alterações

**1. `src/pages/admin/AdminConfiguracoes.tsx`**
- Remover estados `secondaryColor`, `backgroundColor`, `darkSecondaryColor`, `darkBackgroundColor`
- Remover os 2 color pickers extras (secundária e fundo) do modo claro
- Remover os 2 color pickers extras do modo escuro (manter apenas cor primária escura opcional)
- Adicionar função `deriveColors(hex)` que retorna `{ secondary, background }`
- Mostrar preview das cores derivadas ao lado do picker primário
- No `handleSave`, enviar as cores derivadas calculadas para o banco

**2. `src/pages/ProfessionalLanding.tsx`**
- Sem mudanças — já consome `primary_color`, `secondary_color` e `background_color` do banco, que agora serão preenchidos automaticamente

**3. Banco de dados**
- Sem mudanças — as colunas continuam existindo, apenas são preenchidas automaticamente

