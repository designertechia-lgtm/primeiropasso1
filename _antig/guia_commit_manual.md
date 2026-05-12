# Guia rápido — fazer commit manualmente no PrimeiroPasso

> ⚠️ **REGRA DE OURO — vale para TODOS os projetos:**
> **NUNCA commite sem testar localmente primeiro.**
> Não importa se é "só um texto", "só um estilo" ou "só um comentário".
> Qualquer mudança pode quebrar build, roteamento ou integração.
> Teste → veja funcionar → commite. Nessa ordem. Sempre.

Workflow do projeto: **testa local → commita → push** → EasyPanel deploya `main` automaticamente em produção (`primeiropasso.online`).

## 0. Pré-requisitos (uma vez só)

Abrir um terminal (PowerShell ou Git Bash) e ir pra raiz do projeto:

```powershell
cd C:\Users\CLIENTE\projetosClaude\Daia\PrimeiroPassoProjeto\primeiropasso
```

Confirmar que está em `main` e atualizado:

```bash
git branch --show-current      # deve mostrar: main
git pull origin main           # baixa o que tiver de novo
```

## 1. Ver o que mudou

```bash
git status              # lista arquivos modificados (M), novos (??) e deletados (D)
git diff                # diff de tudo que NÃO foi staged ainda
git diff --stat         # só o resumo "X linhas em Y arquivos"
```

Olhar o `git status` antes de qualquer coisa — se aparecer arquivo estranho que você não reconhece (ex: `.env`, log, screenshot), **não commitar**.

## 2. Adicionar (stage) os arquivos

**Nunca use `git add .` ou `git add -A`** — pega lixo (sessões antigas, .env, screenshots, etc).
Sempre liste os arquivos que você quer commitar:

```bash
git add src/pages/admin/AdminGerente.tsx
git add src/components/admin-gerente/ReceitaTab.tsx
git add src/hooks/useOwnerStats.ts
```

Pode passar vários numa linha só:

```bash
git add src/App.tsx src/components/dashboard/DashboardSidebar.tsx
```

Conferir o que ficou staged:

```bash
git status --short
```

Legenda da primeira coluna: `M` modificado, `A` novo, `D` deletado, `R` renomeado.

Se errou e quer **tirar do stage** (sem perder o conteúdo):

```bash
git restore --staged caminho/do/arquivo
```

## 3. Escrever a mensagem do commit

Estilo do repo: **conventional commits em português, lowercase no tipo**, escopo entre parênteses, descrição curta na primeira linha.

Tipos comuns:

| Tipo       | Quando usar                                |
|------------|--------------------------------------------|
| `feat`     | nova funcionalidade                        |
| `fix`      | correção de bug                            |
| `chore`    | manutenção (deps, configs, sem mudar código) |
| `refactor` | reorganização sem mudar comportamento      |
| `style`    | só formatação/espaçamento                  |
| `docs`     | documentação                               |
| `build`    | build/CI                                   |

Exemplos do histórico do projeto:

```
feat(admin-gerente): receita, gráficos e CRUD de PIX/preços (Fatia 2)
fix(App): remove ghost cache-bust junk after export default
chore: force cache invalidation for EasyPanel deployment
restructure: flatten primeiropasso1 nested copy into repo root
```

## 4. Fazer o commit

### Opção A — mensagem curta (1 linha):

```bash
git commit -m "fix(agenda): corrige timezone no FullCalendar"
```

### Opção B — mensagem longa (com corpo explicando o porquê):

No **Git Bash** ou Linux/Mac, use HEREDOC:

```bash
git commit -m "$(cat <<'EOF'
feat(admin): adiciona painel de feedbacks

Tab kanban com 4 colunas (novo, em análise, resolvido, arquivado),
botão flutuante de coleta em todas telas admin e estimativa de NPS.

Motivo: usuários estavam mandando feedback por DM perdido no Insta.
EOF
)"
```

No **PowerShell**, use here-string `@'...'@`:

```powershell
git commit -m @'
feat(admin): adiciona painel de feedbacks

Tab kanban com 4 colunas (novo, em análise, resolvido, arquivado),
botão flutuante de coleta em todas telas admin e estimativa de NPS.
'@
```

⚠️ No PowerShell, o `'@` final tem que estar **na coluna 0** (sem espaço antes).

### Boas práticas pra mensagem
- Primeira linha < 70 caracteres
- Imperativo: "adiciona" e não "adicionado"
- O corpo (depois da linha em branco) explica o **porquê**, não o **o quê**

## 5. Push pra produção

```bash
git push origin main
```

Saída esperada (algo como):

```
   afb6b70..1a2b3c4  main -> main
```

EasyPanel detecta o push em `main` e dispara o build/deploy automaticamente.

## 6. Acompanhar o deploy

- **EasyPanel UI**: serviço `fluxo_raiz/primeiro-passo-site` → aba Deployments
- **Produção**: https://primeiropasso.online (esperar uns 2-3 min após push pro novo bundle aparecer)
- Se o deploy parecer não atualizar e os hashes do `.css`/`.js` no DevTools forem os mesmos do anterior, é o problema antigo da raiz do repo — checar `git rev-parse --show-toplevel` e onde o EasyPanel pega o `package.json`.

## Erros comuns e como sair deles

### "fatal: pathspec 'X' did not match any files"
O arquivo já foi removido/renomeado. Rodar `git status` e ajustar.

### Commit no arquivo errado / quero desfazer o último commit (mas manter as mudanças)
```bash
git reset --soft HEAD~1
```
Volta o commit pro stage, sem perder código.

### Quero descartar mudanças de um arquivo específico (não-commitadas)
```bash
git restore caminho/do/arquivo
```

### "Your branch and 'origin/main' have diverged"
Alguém commitou em `main` antes de você. Resolver com:
```bash
git pull --rebase origin main
# resolve conflitos se houver
git push origin main
```

### ⚠️ Nunca rodar (sem alinhar primeiro)
- `git reset --hard` — apaga mudanças locais permanentemente
- `git push --force` em `main` — quebra o histórico pros outros
- `git commit --amend` depois de já ter feito push — também reescreve história

Se em dúvida, sempre prefira **criar um novo commit** que reverte ou corrige o anterior em vez de reescrever história.

## Checklist final antes de cada push

### ✅ Obrigatório (bloqueia o commit se não passar)

- [ ] **`npm run dev` rodou sem erros** — terminal limpo, sem red errors
- [ ] **A feature funciona em http://localhost:8080** — testei manualmente o fluxo completo
- [ ] **`npm run build` não quebra** — rodar ao menos uma vez por sessão (pega erros de tipo que o dev server ignora)
- [ ] `git status` mostra só os arquivos esperados — sem `.env`, `node_modules/`, logs ou screenshots
- [ ] Mensagem do commit segue o padrão (`tipo(escopo): descrição`)

### 🔍 Por tipo de mudança

| Tipo de mudança | O que testar além do básico |
|---|---|
| UI / componente | Responsivo no mobile? Hover, estados vazios, loading? |
| Nova rota | Navegar diretamente pela URL funciona? Redirect correto? |
| Supabase (query/mutation) | Testar com dados reais, não só mock? RLS não vaza dados? |
| Edge Function | `supabase functions serve` local ou testar em staging? |
| Migration SQL | Rodar no Supabase SQL Editor e confirmar sem erros? |
| Worker Python | `uvicorn app.main:app --reload` sobe sem ImportError? |
| Agente WhatsApp | Simular mensagem via webhook local antes de subir? |

### 🚫 Nunca commitar sem testar

- Mudanças em `App.tsx` (rotas) sem navegar nas rotas afetadas
- Mudanças em `DashboardSidebar.tsx` sem verificar se itens aparecem/somem certo
- Migrations sem executar no SQL Editor e confirmar `0 errors`
- Edge functions sem testar ao menos o caminho feliz
- Código gerado por IA sem revisar e rodar localmente
