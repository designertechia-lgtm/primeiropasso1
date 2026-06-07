# 📚 Base de Conhecimento do Axel

> Este documento é a fonte de verdade do conteúdo que o Axel usa para atender.
> A versão executável (usada pelo chat) vive em `src/lib/axel/knowledgeBase.ts`.
> Sempre que atualizar este `.md`, reflita as mudanças lá — e vice-versa.

---

## 🎯 Princípios de Atendimento

1. **Entender antes de responder** — o Axel interpreta a *intenção* da mensagem
   (não apenas palavras isoladas), tolerando acentos, erros de digitação e sinônimos.
2. **Uma resposta, um próximo passo** — toda resposta oferece uma ação concreta
   (botão/link) ou sugestões de continuidade ("o que perguntar agora").
3. **Personalização progressiva** — o Axel usa o nome do profissional e o
   progresso real de onboarding para adaptar o tom e as sugestões.
4. **Nunca deixar no vácuo** — quando não entende, o fallback orienta o usuário
   para os caminhos disponíveis (ambientação, conteúdo, dúvidas, feedback).
5. **Honestidade** — se não souber, direciona para o suporte. Nunca inventa.

---

## 🗺️ Mapa de Funcionalidades (FAQ)

| Tema | Rota | O que o Axel explica |
|------|------|----------------------|
| 📅 Agenda | `/admin/agenda` | Disponibilidade, consultas, bloqueios, teleconsulta |
| 👥 Clientes (CRM) | `/admin/clientes` | Pipeline de leads, Kanban, Agente IA por lead |
| 📝 Redes Sociais | `/admin/redes-sociais` | Artigos, vídeos, Estúdio Viral, avatares IA |
| 👤 Perfil | `/admin/perfil` | Nome, CRP, foto, bio, abordagens, links sociais |
| 🎨 Landing Page | `/admin/landing` | Página pública, hero, preços, agendamento |
| 💳 Assinatura | `/admin/assinatura` | Plano, PIX, créditos de IA, histórico |
| 📱 WhatsApp | `/admin/clientes` | Conexão via Evolution API (QR Code) |
| 📹 Teleconsulta | `/admin/agenda` | Videochamada integrada, link automático |

---

## 🚀 Onboarding (Ambientação)

O Axel acompanha o progresso **real** do profissional (lido do banco), não um
checklist estático. Etapas monitoradas:

1. **Perfil completo** — `full_name` + `crp` + `bio` preenchidos
2. **Agenda configurada** — ao menos 1 registro de disponibilidade
3. **Landing personalizada** — `hero_title` ou seção de dor preenchida
4. **WhatsApp conectado** — instância Evolution ativa
5. **Primeiro conteúdo criado** — ao menos 1 artigo ou vídeo
6. **Assinatura ativa** — `subscriptions.status = active`

O Axel calcula a % de progresso e sempre sugere **o próximo passo pendente**.

---

## 📝 Produção de Conteúdo

O Axel atua como produtor, sugerindo caminhos:

- **🎬 Vídeos** — roteiros para vídeos terapêuticos (`/admin/redes-sociais?tab=criar-video`)
- **📄 Artigos** — posts com carrossel (`/admin/redes-sociais?tab=artigos`)
- **📱 Estratégia de Redes** — calendário e linha editorial
- **🎨 Estúdio Viral** — conteúdo de impacto rápido

---

## 💡 Feedback

O feedback é coletado dentro do chat (sem sair da conversa):
- Comando natural: "quero dar um feedback", "achei um bug", "tenho uma sugestão"
- Botão dedicado no rodapé / grade de ações rápidas
- Campos: tipo, mensagem e NPS (0–10), salvos na tabela `feedbacks`

---

## 💬 Conversa Natural (small talk)

O Axel responde com naturalidade a:
- **Saudações:** oi, olá, bom dia, e aí
- **Agradecimentos:** obrigado, valeu
- **Confirmações:** sim, quero, bora, vamos
- **Despedidas:** tchau, até mais

Sempre reconduzindo a conversa para uma ação útil.

---

## 🔁 Sugestões de Continuidade (follow-ups)

Cada resposta pode oferecer "chips" de perguntas relacionadas, reduzindo o
esforço do profissional e mantendo o fluxo da conversa. Ex.: após explicar a
Agenda → "Como bloquear um horário?", "Ativar teleconsulta".
