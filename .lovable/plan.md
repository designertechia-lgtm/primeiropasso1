

## Plan: Adicionar upload de foto de perfil no AdminPerfil

### O que muda
Adicionar o componente `ImageUpload` (já existente) na página `AdminPerfil` para permitir upload da foto de perfil do profissional.

### Alterações

**Arquivo: `src/pages/admin/AdminPerfil.tsx`**

1. Importar `ImageUpload` de `@/components/dashboard/ImageUpload`
2. Adicionar estado `photoUrl` inicializado com `professional.photo_url`
3. No card "Dados Pessoais", adicionar o `ImageUpload` com `variant="avatar"` e `folder="photos"` acima dos campos de nome/CRP
4. No `handleSave`, incluir `photo_url: photoUrl` no update da tabela `professionals`

Nenhuma migração necessária — a coluna `photo_url` já existe na tabela `professionals`.

