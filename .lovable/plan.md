

## Plano: Perfil fake de demonstração como fallback

### Objetivo
Quando não houver nenhum profissional cadastrado no banco, a página inicial (`/`) exibirá uma landing page completa com dados fictícios de demonstração, em vez da mensagem vazia "Nenhum profissional cadastrado".

### Abordagem
Criar os dados fake diretamente no código (sem depender do banco), passando-os ao `ProfessionalLanding` como props ou renderizando os componentes da landing diretamente.

### Alterações

**1. Criar `src/data/demoProffessional.ts`**
- Exportar um objeto constante com todos os campos de um profissional demo:
  - Nome: "Dra. Marina Oliveira", CRP: "06/123456"
  - Bio profissional coerente (~150 palavras)
  - Abordagens: TCC, ACT, Mindfulness, Psicologia Positiva
  - Hero title/subtitle motivacionais
  - Fotos: URLs do Unsplash (perfil, hero, about)
  - Cores: primary `#87A96B`, secondary `#C4A882`, background `#F5F0EB`
  - Slug: `demo`
  - WhatsApp fictício

**2. Alterar `src/pages/Index.tsx`**
- Quando `!professional` (nenhum cadastrado), em vez da mensagem vazia, renderizar os componentes da landing page (HeroSection, AboutSection, etc.) usando os dados do `demoProfessional`
- Adicionar um banner sutil no topo indicando "Este é um perfil de demonstração" com CTA para cadastro

**3. Sem alterações no banco de dados**
- Tudo fica no código frontend, sem inserir dados fictícios no banco

### Resultado
Visitantes veem uma landing page profissional completa como modelo, com indicação clara de que é uma demonstração e botão para se cadastrar.

