

## Plano: Simplificar seção "Agende Sua Primeira Consulta"

### O que muda
Remover o formulário de captura de leads (campos nome, email, WhatsApp) e substituir por dois botões de ação direta: um para agendar pelo site e outro pelo WhatsApp.

### Alterações

**1. `src/components/landing/LeadCaptureSection.tsx`**
- Remover estados, formulário e lógica de submit
- Adicionar props `whatsapp` e `slug` (para construir os links)
- Manter título "Agende Sua Primeira Consulta" e ícone
- Novo conteúdo: texto motivacional + dois botões lado a lado:
  - **"Agendar pelo Site"** — link para `/{slug}/agendar` (botão primário com ícone Calendar)
  - **"Agendar pelo WhatsApp"** — link para `https://wa.me/...` (botão outline verde com ícone MessageCircle)

**2. `src/pages/ProfessionalLanding.tsx`**
- Passar `whatsapp` e `slug` como props para `LeadCaptureSection`

