

## Plano: Padronizar formato de telefone para "5548998385330"

### Problema atual
- No cadastro (`Cadastro.tsx`), o placeholder é "(11) 99999-9999" e aceita qualquer formato
- No perfil do paciente (`PatientPerfil.tsx`), mesmo placeholder com formato livre
- Os números são armazenados no banco exatamente como digitados, sem normalização

### Alterações

**1. `src/pages/Cadastro.tsx`**
- Alterar placeholder para "5548998385330"
- Adicionar normalização antes de enviar: remover tudo que não é dígito (`replace(/\D/g, "")`)
- Manter `type="tel"`

**2. `src/pages/paciente/PatientPerfil.tsx`**
- Alterar placeholder para "5548998385330"
- Adicionar normalização no `handleSave`: remover caracteres não numéricos antes de salvar

**3. Ambos os formulários**
- Opcionalmente, filtrar a digitação para aceitar apenas dígitos (on change)

### Resultado
Todos os telefones serão armazenados no formato somente dígitos com código do país (ex: `5548998385330`), sem parênteses, traços ou espaços.

