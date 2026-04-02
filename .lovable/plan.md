

# Ajuste: Leads = Novos Pacientes (sem divulgação)

## O que muda

A seção "LeadCaptureSection" na landing page está posicionada como "Material Gratuito / Guia" (divulgação/marketing). O correto é que essa seção funcione como **captação de novos pacientes** — pessoas interessadas em iniciar acompanhamento com o profissional.

## Alterações

### 1. Reescrever `LeadCaptureSection.tsx`
- Trocar ícone `Gift` por `UserPlus` (novo paciente)
- Título: "Quero Iniciar Meu Acompanhamento" ou "Agende Sua Primeira Consulta"
- Texto: convidar o visitante a deixar seus dados para o profissional entrar em contato e agendar a primeira sessão
- Campo `interest`: mudar de `"guia-gratuito"` para `"novo-paciente"`
- Botão: "Quero Agendar Minha Primeira Consulta"
- Toast de sucesso: "O profissional entrará em contato em breve para agendar sua primeira sessão"

### 2. Ajustar a tabela `leads` (conceitual)
- Nenhuma alteração de schema necessária — a tabela `leads` já serve para captar contatos. Apenas o campo `interest` muda de valor no código.

### 3. Remover referências a "divulgação" ou "material gratuito"
- Verificar se há menções em outros componentes (ContentSection, LandingHeader) e ajustar se necessário.

## Sem alteração
- PainSection e SolutionSection permanecem como estão (são conteúdo da landing, não divulgação)
- Estrutura de banco de dados não muda

