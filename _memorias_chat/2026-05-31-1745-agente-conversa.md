---
chat_id: 2026-05-31-1745
feature: agente-conversa
data_hora: 2026-05-31T17:45:00-03:00
assinado_por_ia: Claude Opus 4.8
assinado_por_humano: designertechia-lgtm
imutavel: true
corrige: null
---

# Caminhos explorados sem sucesso

## Caminho 1: migrar tudo pro worker de uma vez (big-bang) e aposentar o n8n
- **Como foi explorado:** avaliei substituir o fluxo n8n aprovado pelo worker
  Python já nesta sessão, já que o worker é versionável/testável/mais barato.
- **Por que não deu certo:** o worker é reimplementação PARCIAL e tinha bug
  perigoso (LLM confirmando agendamento alucinado). Trocar o que está testado
  e em produção pelo incompleto = risco direto no cliente final.
- **Pode ter sido erro de exploração?** Não. A decisão certa foi manter o n8n em
  produção e portar em fases, com shadow antes de cortar.

## Caminho 2: confirmação de agendamento por "tem data + hora → agenda"
- **Como foi explorado:** primeira versão do `try_confirmar_agendamento` ia
  agendar sempre que detectasse data E hora na mensagem.
- **Por que não deu certo:** falso-positivo grave — "tem horário amanhã às 15h?"
  é pergunta de disponibilidade, não confirmação; agendaria sozinho.
- **Pode ter sido erro de exploração?** Foi simplismo. Corrigido com o guard
  `quer_confirmar_horario` (exclui perguntas; exige intenção de agendar) + só
  agenda em slot que realmente existe na disponibilidade.

# Caminho que funcionou

- **Decisão final:** arquitetura híbrida do modelo n8n portada pro worker —
  determinístico decide ação de agendamento; LLM só conversa e oferece horários.
  `criar_agendamento` removido das tools do LLM; confirmação em `scheduling.py`.
- **Raciocínio:** a fonte da alucinação era dar ao LLM o poder de confirmar.
  Tirar esse poder (e validar contra a disponibilidade real) elimina a classe
  inteira de bug, sem depender de "prompt melhor".
- **Por que essa e não as anteriores:** baixo risco (em fases), e ataca a causa
  raiz em vez de remediar com prompt.

# Invariantes desta sessão

- Se o agente for confirmar/remarcar/cancelar agendamento, então quem executa é
  o sistema (determinístico) — o LLM nunca chama criar/cancelar/remarcar.
- Só confirmar horário que existe na `availability` do profissional (sem inventar).
- Mensagens de spam/injection/vazia são barradas ANTES de entrar no histórico,
  pra não envenenar o contexto do LLM.
- Mensagens rápidas se UNIFICAM (buffer+debounce); nunca descartar partes.
- Contexto terapia ≠ vendas: intenção 'recusa' respeita o limite, não insiste.

# Pendências

- Fases #8 (reagendar/cancelar/listar), #6 (agenda do cliente no contexto),
  #9 (persona multi-tenant rica), #10 (menus/botões WhatsApp).
- Rodar `pytest` na venv do worker (pytest/redis não instalados na sessão).
- Decidir gatilho de shadow-run worker vs n8n antes de cortar o n8n.

---
Selado em 2026-05-31T17:45:00-03:00. IA: Claude Opus 4.8. Humano:
designertechia-lgtm. **Imutável** — pra corrigir, crie novo dossiê com
`corrige: 2026-05-31-1745`.
