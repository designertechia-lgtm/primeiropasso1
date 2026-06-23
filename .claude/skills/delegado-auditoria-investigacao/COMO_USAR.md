# Como usar a skill `delegado-auditoria-investigacao`

A skill é a **postura + procedimento** de investigação/auditoria. Ela vive em dois lugares:

- **Local (sua máquina):** `~/.claude/skills/delegado-auditoria-investigacao/` — disponível em qualquer projeto no VS Code.
- **No repositório (versionada):** `primeiropasso/.claude/skills/delegado-auditoria-investigacao/` — viaja no git, então aparece no **claude.ai/code** quando você abre o repo lá. É a cópia **fonte da verdade** (editar aqui).

> As duas devem ficar iguais. Se editar uma, copie pra outra (ou peça pro Claude sincronizar).

---

## A) Claude Code no VS Code (local)

1. Abra o Claude Code no projeto.
2. Invoque de uma das formas:
   - Digite **`/delegado-auditoria-investigacao`** no chat; ou
   - Só descreva a tarefa — *"audita as conversas do Axel"*, *"investiga por que o agente repete"* — a `description` dispara a skill sozinha.
3. As ferramentas de dados já funcionam: o `query_pp.py` cai no `c:/tmp/.supabase-projects.json` local, e o deploy usa `c:/tmp/deploy_function.py`. Nada a configurar.

## B) claude.ai/code (remoto — auditoria de qualquer lugar)

1. Abra o repositório **`designertechia-lgtm/primeiropasso1`** no claude.ai/code.
2. A skill vem no clone (em `.claude/skills/`). Confirme: digite **`/`** e procure `delegado-auditoria-investigacao`, ou invoque direto pelo nome / descrevendo a auditoria.
3. **Para acessar o banco remotamente, configure as credenciais como variáveis de ambiente da sessão** (elas NÃO ficam no git, por segurança):
   - `SUPABASE_PP_REF` = `lpqkkbtadnqkbathdvzb`
   - `SUPABASE_PP_TOKEN` = seu token de Management API do Supabase (`sbp_...`)
   - Como setar: nas configurações de ambiente/secrets do claude.ai/code, ou colando no início da sessão: `export SUPABASE_PP_REF=...` e `export SUPABASE_PP_TOKEN=...`.
4. Rode as queries com o helper portátil:
   ```
   python .claude/skills/delegado-auditoria-investigacao/scripts/query_pp.py consulta.sql saida.json
   # ou inline:
   python .claude/skills/delegado-auditoria-investigacao/scripts/query_pp.py -c "select count(*) from chat_messages" out.json
   ```
5. **Limites do remoto:** auditar (ler dados, achar causa-raiz, escrever auditoria/plano) funciona 100%. **Deploy de edge** (`deploy_function.py`) e **push** dependem de token/credencial de escrita — normalmente faça isso na máquina local, ou configure os secrets equivalentes no ambiente remoto.

---

## Exemplo de invocação

> "Delegado, audita a `chat_messages` do lead X — ele reclamou que o Axel ficou repetindo. Quero causa-raiz com prova e um plano datado."

O Claude vai: puxar a conversa inteira (`query_pp.py`), montar a linha do tempo, confrontar a hipótese no código (`arquivo:linha`), provar no dado (antes/depois), e — se for aplicar fix — verificar de forma adversarial antes de mexer, registrando a auditoria em `auditorias/` e o plano em `auditorias_planos/`.

## Segurança

- **Nunca** comite token no git. O `query_pp.py` lê de env var / arquivo local; o segredo fica fora do repo.
- O `.gitignore` mantém `.claude/` ignorado, com exceção só de `.claude/skills/` (a skill é versionada; settings locais não).
