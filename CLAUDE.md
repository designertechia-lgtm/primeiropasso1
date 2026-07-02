# Primeiro Passo — regras do aplicativo

## Processamento em segundo plano SEMPRE com permanência de estado

Toda operação demorada (mais de ~5s: geração com IA, render de vídeo, publicação,
importação) é criada de forma que o usuário possa **sair da tela e continuar usando
o painel** sem perder o trabalho — nunca presa ao ciclo de vida do componente React.

**Nível 1 — padrão mínimo (operações de até ~2 min):**
- O job vive no escopo do módulo (fora do componente): promise + resultado pendente
  \+ callback de re-adoção. Ao remontar, a tela re-adota o job em andamento ou aplica
  o resultado que chegou enquanto estava fora.
- Toast global (sonner, `<Toaster/>` no App root) avisa a conclusão em qualquer tela,
  com instrução de onde revisar o resultado.
- Durante o processamento: botão desabilitado + balão "Pode ir fazendo outra coisa…
  avisamos quando ficar pronto. Só não feche nem recarregue o navegador."
- Implementação de referência: `src/components/admin/landing/BrandDnaEditorTab.tsx`
  (`dnaJob` + `runDnaGeneration`).

**Nível 2 — operações longas, caras ou críticas (devem sobreviver a reload/fechar):**
- O estado do job é persistido no servidor (tabela de jobs ou coluna de destino) e o
  front reidrata a partir do banco; o processamento roda server-side (edge/worker),
  não no navegador. Exemplo: vídeos institucionais no `video-api` (histórico em banco).
- Use o Nível 2 sempre que refazer a operação custar dinheiro real de API e a duração
  passar de ~2 min.

Ao criar uma feature nova com espera, escolha o nível na hora do design — não deixe
para "depois": estado preso no componente descarta trabalho já pago quando o usuário
navega.
