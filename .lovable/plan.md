

## Plan: Imagens separadas para Hero e Sobre

Atualmente, a mesma `photo_url` é usada no Hero e na seção Sobre. O objetivo é ter 3 imagens independentes: foto de perfil, imagem do Hero e imagem do Sobre.

### Alterações

**1. Migração SQL** -- Adicionar 2 colunas na tabela `professionals`:
```sql
ALTER TABLE public.professionals
  ADD COLUMN hero_image_url text,
  ADD COLUMN about_image_url text;
```

**2. `src/pages/admin/AdminPerfil.tsx`**
- Adicionar estados `heroImageUrl` e `aboutImageUrl`, inicializados com `professional.hero_image_url` e `professional.about_image_url`
- No card "Página Inicial (Hero)", adicionar `ImageUpload` com `folder="hero"` e label "Imagem do Hero"
- No card "Biografia", adicionar `ImageUpload` com `folder="about"` e label "Imagem da seção Sobre"
- No `handleSave`, incluir `hero_image_url` e `about_image_url` no update

**3. `src/pages/ProfessionalLanding.tsx`**
- Passar `professional.hero_image_url` para `HeroSection` (fallback para `photo_url`)
- Passar `professional.about_image_url` para `AboutSection` (fallback para `photo_url`)

**4. `src/components/landing/HeroSection.tsx`**
- Adicionar prop `heroImageUrl` opcional
- Usar `heroImageUrl || photoUrl` como src da imagem

**5. `src/components/landing/AboutSection.tsx`**
- Adicionar prop `aboutImageUrl` opcional
- Usar `aboutImageUrl || photoUrl` como src da imagem

Com isso, o profissional pode ter imagens diferentes em cada seção, usando a foto de perfil como fallback quando não houver imagem específica.

