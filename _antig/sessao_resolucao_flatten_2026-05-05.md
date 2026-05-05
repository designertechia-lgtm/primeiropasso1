# Resumo da Sessão: Resolução Definitiva do Deploy — Parte 2
**Data:** 05 de Maio de 2026
**Continuação de:** `sessao_admin_deploy.md`

## 1. Por Que a "Parte 1" Não Bastou

O memorando da Parte 1 culpou três suspeitos: erro silencioso de sintaxe, cache do Nixpacks e cache `.tar.gz` do GitHub. As correções aplicadas (rm -rf nuclear no `package.json`, sincronizar `main` e `master`, "commit fantasma") foram empurradas para o GitHub. Pela manhã, ao clicar em **Implantar**, o EasyPanel deu **Success**, mas a versão em produção continuava servindo exatamente os mesmos arquivos das semanas anteriores: `index-Cz-3OM89.css` e `index-B3WW1sGs.js`. Bundles com hash determinístico **não mudam se o código-fonte não muda** — então o EasyPanel estava buildando algum código que **não era o nosso**.

## 2. A Causa Raiz Verdadeira

O repositório git tinha **duas cópias do projeto na mesma árvore**, em níveis diferentes:

- **Cópia OUTER** — raiz do repo, em `C:\Users\CLIENTE\` (sim, o repo git tem como root o diretório home do usuário, herança histórica). Continha `package.json`, `src/`, `vite.config.ts` etc, mas **congelada** num commit antigo (`902167f`, semanas atrás). Era esta cópia que o EasyPanel buildava, porque "Caminho de Construção" estava configurado como `/`.
- **Cópia INNER** — em `OneDrive/Desktop/Cloude Code/CloudeN8n/Daia/SitePrimeiroPasso/primeiropasso1/`. Era onde toda a equipe (humano + IA) editava código nos últimos meses. Tinha tudo: AdminAssinatura, Dark Mode, AdminClientesKanban, AdminAgendaCalendario, BillingBanner, glassmorphism, contraste, e o próprio `package.json` com o `rm -rf` nuclear.

Os commits modernos viajavam para o GitHub (paths nested tipo `OneDrive/Desktop/Cloude Code/.../primeiropasso1/src/App.tsx`), mas o EasyPanel só olhava para o **diretório raiz** do repo. Resultado: meses de evoluções "presas" numa subpasta que o build nem enxergava. O Success do EasyPanel era verdadeiro; ele realmente buildou e publicou — só que a partir do projeto antigo abandonado na raiz.

A "smoking gun" foi um simples `git rev-parse --show-toplevel` retornando `C:/Users/CLIENTE` em vez do path do projeto.

## 3. Soluções Aplicadas (em ordem)

1. **Flatten do INNER para a raiz** (commit `6b982dd restructure: flatten primeiropasso1 nested copy into repo root`). Usado `robocopy` em modo merge: sobrescreve arquivos comuns com a versão atualizada do INNER, copia novos, **preserva** o que só existia na raiz (Dockerfile, nixpacks.toml, nginx.conf, worker-primeiropasso/, supabase/functions e migrations existentes, public/hero-bg-default.jpg etc). Backend Supabase (40+ functions, 38 migrations) ficou intacto.
2. **Correção do build script** (commit `2dafba3 fix(build): remove node_modules/.cache from rm -rf`). O comando original `rm -rf dist node_modules/.vite node_modules/.cache && vite build` falhava com "Device or resource busy" porque `node_modules/.cache` é **mount do Docker buildkit**, não pasta normal — não dá pra remover por dentro do container. Vite usa `node_modules/.vite`, não `.cache`. Corrigido para `rm -rf dist node_modules/.vite && vite build`.
3. **Limpeza do App.tsx** (commit `6777759 fix(App): remove ghost cache-bust junk after export default`). O "commit fantasma" da Parte 1 havia deixado 7 linhas de texto solto após `export default App;` (`// Forcing GitHub archive cache invalidation`) **com null bytes intercalados** — um descuido de encoding. Antes do flatten o EasyPanel buildava o OUTER, que não tinha esse lixo; após o flatten, o esbuild encontrou o null byte e abortou com `Expected ";" but found "\x00"`. Arquivo truncado em `export default App;` e regravado em UTF-8 sem BOM.

Após esses três commits, o build no EasyPanel passou: bundle novo gerado, hashes diferentes, AdminAssinatura/DarkMode/BillingBanner finalmente em produção.

## 4. Como Verificar Que Está Funcionando

- Hashes do bundle (`dist/assets/index-XXXXXX.{css,js}`) **mudam** entre deploys quando há mudança de código.
- `https://primeiropasso.online/admin/landing` (Ctrl+F5) mostra aba "Assinatura" na sidebar, toggle de Modo Escuro, slider de opacidade do card hero e BillingBanner no topo.
- `git log --oneline -5` no repositório mostra os três commits da resolução acima do `54cc380`.

## 5. Regras Para Não Voltar a Acontecer

1. **Antes de assumir que um repo é o que parece, rodar `git rev-parse --show-toplevel`.** Se a raiz do repo for o home do usuário ou qualquer pasta acima do projeto, é sinal vermelho — provavelmente há cópias paralelas e o serviço de deploy pode estar buildando a errada.
2. **"Deploy disse Success mas produção não atualizou" ≠ problema de cache.** Se os hashes do bundle (`index-*.css`, `index-*.js`) **não mudaram** entre dois deploys consecutivos, o problema é da fonte, não do cache. Cache de fato faria os hashes mudarem mas o conteúdo igual; cache de Docker faria layers serem reutilizadas mas os hashes ainda mudariam quando o build rodasse de fato.
3. **Não criar cópias do projeto em subpastas dentro do mesmo repo.** Se precisar de uma cópia de trabalho separada, use outro diretório (fora do repo) ou outro branch — nunca uma subpasta paralela.
4. **Cache-bust não se faz com texto solto após `export default`.** Se for absolutamente necessário forçar um hash novo, mudar uma string interna do código (ex: incrementar uma constante `BUILD_VERSION = "1.2.3"`), nunca colar texto livre que possa virar lixo. E sempre verificar o encoding final (UTF-8 sem BOM).
5. **`node_modules/.cache` é território do Docker buildkit no EasyPanel/Nixpacks.** Não tentar `rm -rf` essa pasta dentro de scripts de build. Para cache busting do Vite, basta `rm -rf dist node_modules/.vite`.

## 6. Comandos Diagnósticos Para Futuras Suspeitas

```bash
# Onde está realmente a raiz do repo?
git rev-parse --show-toplevel

# Local e remoto estão sincronizados?
git rev-parse HEAD main master origin/main origin/master
git ls-remote origin refs/heads/main refs/heads/master

# Que arquivo o último commit modificou? (pega path completo a partir da raiz do repo)
git show --stat HEAD

# Existe algum package.json paralelo escondido?
find . -name package.json -not -path "*/node_modules/*"

# Verificar null bytes em arquivos do src/ antes de commitar
# (PowerShell): $bytes = [System.IO.File]::ReadAllBytes($file); $bytes -contains 0
```

## 7. Pendências Pós-Resolução

- A pasta nested `OneDrive/Desktop/Cloude Code/CloudeN8n/Daia/SitePrimeiroPasso/primeiropasso1/` ainda existe como rede de segurança. Pode ser apagada após validação completa do admin em produção.
- Backup zip pré-flatten em `C:\backup\backup_primeiropasso_2026-05-05.zip` — manter por uns dias e depois apagar.
- Há um warning do git: "too many unreachable loose objects; run 'git prune' to remove them". Rodar `git prune` para limpar.
- Investigar por que `https://primeiropasso.online/designertech-io` (sem www) responde diferente do `https://www.primeiropasso.online/designertech-io` (com www) — possível configuração de DNS ou redirect no EasyPanel apontando o root domain para destino diferente.
