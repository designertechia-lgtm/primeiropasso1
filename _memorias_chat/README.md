# Memória do projeto Primeiro Passo

Esta pasta guarda **dossiês assinados e imutáveis** de cada sessão de trabalho
relevante. Não tem mapa manual — descobrir é por convenção:

- **Features ativas:** `ls _docs/features/`
- **Features descontinuadas:** `ls _arquivo/features/`
- **Dossiês de uma feature:** `ls _memorias_chat/*<feature>*`
- **Quem mudou o quê:** `git log -- <arquivo>` ou comentário-âncora no topo do
  arquivo de código (formato `# feature: <nome> — ver _docs/features/<nome>.md`)

## Convenções

- **chat-id:** `YYYY-MM-DD-HHMM` em horário local
- **Feature kebab-case:** `agente-conversa`, não `agenteConversa`
- **Assinatura humana:** vem de `user_perfil.md` (memória global) ou
  `git config user.name`. Nunca inventar.
- **Dossiê é imutável.** Corrigir = novo dossiê com `corrige: <chat-id-errado>`.

## Atalhos operacionais

- **Fluxo conversacional "ideal" (modelo aprovado):**
  `worker-primeiropasso/fluxomodelo_update/AgenteConversasional_evolutioAPI.json`
  (n8n). O worker Python espelha esse fluxo em fases — ver
  `_docs/features/agente-conversa.md`.
