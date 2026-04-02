

## Plan: Botão dinâmico baseado no papel do usuário

### O que muda
No `LandingHeader.tsx`, quando o usuário está logado:
- **Admin/Profissional** → botão "Admin" apontando para `/admin`
- **Paciente** → botão "Minha Conta" apontando para `/minha-conta`

### Alteração

**Arquivo: `src/components/landing/LandingHeader.tsx`**

1. Trocar `const { user } = useAuth()` por `const { user, isProfessional } = useAuth()`
2. Nos dois locais onde aparece o botão "Minha Conta" (desktop e mobile), adicionar lógica condicional:
   - Se `isProfessional`: texto "Admin", link para `/admin`
   - Senão: texto "Minha Conta", link para `/minha-conta`

Nenhum outro arquivo precisa ser alterado.

