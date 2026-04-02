

## Plan: Adicionar telefone obrigatório ao cadastro

### Alterações

**1. Migração SQL** -- Atualizar a trigger `handle_new_user` para salvar o telefone:
```sql
CREATE OR REPLACE FUNCTION public.handle_new_user() ...
  INSERT INTO public.profiles (user_id, full_name, phone)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
          NEW.raw_user_meta_data->>'phone');
```

**2. `src/pages/Cadastro.tsx`**
- Adicionar campo de telefone obrigatório entre "Nome completo" e "E-mail"
- Incluir `phone` nos metadados do `signUp` (`options.data`)

Nenhuma alteração no login. O telefone é apenas salvo no perfil.

