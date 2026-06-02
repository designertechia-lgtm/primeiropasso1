---
chat_id: 2026-06-01-landing-cores
feature: identidade-visual
data_hora: 2026-06-01T22:40:00-03:00
assinado_por_ia: Claude Opus 4.8
assinado_por_humano: designertechia-lgtm
imutavel: true
corrige: null
---

# Caminhos explorados sem sucesso

## Caminho 1: arredondar a imagem da seção Sobre com `rounded` na própria <img>
- **Como foi explorado:** várias tentativas pondo `rounded-xl` direto na <img>,
  trocando `object-cover`↔`object-contain`, mexendo em `min-h`, `max-h`, `items-stretch`.
- **Por que não deu certo:** (1) o overlay do botão de play (`absolute inset-0`)
  ficava por cima cobrindo os cantos; (2) `object-contain` + `w-full` cria espaço
  transparente lateral, então o `rounded` arredondava a caixa vazia, não a foto.
  Resultado: ora cortava a foto, ora ficava sem efeito visível.
- **Pode ter sido erro de exploração?** SIM. Fiquei trocando valores sem entender a
  causa raiz. O usuário pediu pra estudar a doc (MDN object-fit) e mandou parar de
  inventar — estava certo. A leitura da doc + a estrutura clarearam tudo.

## Caminho 2: "moldura" só com padding (sem container envolvendo a imagem)
- **Como foi explorado:** dei `p-3` no container existente achando que era moldura.
- **Por que não deu certo:** o usuário pediu explicitamente um CONTAINER que
  ENVOLVE a imagem; padding não recorta a imagem. Faltava o wrapper.

## Caminho 3 (ERRO GRAVE): cherry-pick --abort com working tree sujo
- **Como foi explorado:** pra separar commits de frontend pra main, rodei
  `git cherry-pick --abort` com mudanças não-commitadas no working tree.
- **Por que não deu certo:** o `--abort` DESCARTOU o `AuditPanel.tsx` (untracked,
  410 linhas) do usuário. Untracked não vira blob no git → não recuperável por
  fsck nem stash. Tive que RECONSTRUIR o AuditPanel do zero a partir do contrato
  (FeedbackTab usa `<AuditPanel audit onBack>`) + o tipo `FeedbackAudit` em
  useOwnerStats.ts (que sobreviveu).
- **Auto-crítica:** nunca rodar operação git destrutiva (`--abort`, `reset --hard`,
  `checkout --`) com working tree sujo SEM antes garantir o conteúdo. Untracked
  some sem volta.

# Caminho que funcionou

- **Arredondar imagem:** WRAPPER `<div overflow-hidden rounded-xl w-fit>` ENVOLVENDO
  a <img>. O `overflow-hidden` recorta imagem + overlay juntos; `w-fit` cola o
  wrapper no tamanho real da foto (sem espaço fantasma). Moldura = container pai com
  `p-3` + `bg-card` + sombra.
- **Levar só frontend pra main sem arrastar trabalho não-revisado:** commitar SÓ os
  arquivos de cor numa branch, `git stash push -u` das pendências, `checkout main`,
  `cherry-pick <commit-cor>`, build, `push origin main`, voltar pra branch,
  `stash pop`. Funcionou várias vezes sem perda.
- **Paleta:** aplicar regra 60-30-10 — trocar azuis (hue 222/210/219) por verde
  (160/165) no tema, neutralizar ícones decorativos, manter só cor semântica.

# Invariantes desta sessão

- O fluxo de deploy do projeto é: commit em `main` → `git push origin main` →
  EasyPanel auto-deploya `primeiro-passo-site`. Branches de feature NÃO sobem.
  (documentado em `_docs/_referencia/guia_commit_manual.md` — sempre consultar)
- 3 fontes de cor independentes: `:root` (landing /), `.theme-admin` (painel),
  `professionals.primary_color` (páginas /slug). Mudar uma não afeta as outras.
- Arredondar imagem com overlay = wrapper `overflow-hidden`, nunca `rounded` na img.
- Nunca git destrutivo com working tree sujo (untracked não se recupera).

# Pendências

- Trabalho de feedback/auditoria do usuário (FeedbackTab, AuditPanel reconstruído,
  useOwnerStats, edges run-feedback-audit/whatsapp-admin-agent, migrations) está
  na branch `fix/agente-conversa-fases-n8n`, NÃO-revisado, NÃO subir até revisar.
- AuditPanel.tsx foi RECONSTRUÍDO por IA (189 linhas) — pode diferir do original
  perdido; usuário deve validar a aba Auditorias.
- Backend de voz (G1/G2/G4) na branch fix/, precisa ELEVENLABS_API_KEY no Supabase
  + deploy manual das edges (ver _docs/features/agente-whatsapp-midia.md).

---
Selado em 2026-06-01T22:40:00-03:00. IA: Claude Opus 4.8. Humano:
designertechia-lgtm. **Imutável** — pra corrigir, crie novo dossiê com
`corrige: 2026-06-01-landing-cores`.
