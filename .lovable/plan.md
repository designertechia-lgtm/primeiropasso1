

# Landing Page Focada no Profissional Individual

## Contexto
O site é individual (um profissional por instalação), então a página Index atual (marketplace genérico "conecte-se com profissionais") não faz sentido. A landing page principal (`/`) deve ser a do profissional, com destaque para a foto de perfil no hero.

## Alterações

### 1. Redirecionar `/` para a landing do profissional
- Em `Index.tsx`, buscar o primeiro (e único) profissional no banco e renderizar `ProfessionalLanding` diretamente, ou redirecionar para `/:slug`.
- Alternativa mais simples: na rota `/`, carregar o único profissional e passar os dados para os componentes de landing existentes.

### 2. Redesenhar o HeroSection com destaque na foto de perfil
- Aumentar a foto de perfil: torná-la o elemento central/protagonista do hero.
- Adicionar moldura circular ou oval com borda decorativa e sombra.
- Exibir o nome do profissional e CRP abaixo/ao lado da foto.
- Manter os botões de CTA (Agendar Consulta, Ver Horarios).
- Layout: foto grande centralizada no topo com texto abaixo, ou foto à direita com tamanho maior e estilo mais impactante.

### 3. Passar dados do profissional (nome, CRP) ao HeroSection
- Adicionar props `professionalName` e `crp` ao `HeroSectionProps`.
- Em `ProfessionalLanding.tsx`, passar `name` e `crp` para o `HeroSection`.

### 4. Adaptar Index.tsx
- Remover o conteúdo genérico de marketplace.
- Fazer query do único profissional e renderizar os mesmos componentes de `ProfessionalLanding`.

## Arquivos afetados
- `src/components/landing/HeroSection.tsx` -- redesenho com foto em destaque, nome e CRP
- `src/pages/Index.tsx` -- substituir conteúdo genérico pela landing do profissional
- `src/pages/ProfessionalLanding.tsx` -- passar nome e CRP ao HeroSection

