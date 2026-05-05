# Resumo da Sessão: Admin UI, Dark Mode e Troubleshooting de Deploy
**Data:** 05 de Maio de 2026

## 1. Funcionalidades Desenvolvidas
- **Controle de Opacidade do Card (Glassmorphism):** Refatoramos o código do painel Admin (`AdminLandingPage.tsx`) para exibir permanentemente o slider de opacidade do card da Hero Section, removendo a dependência de haver uma imagem de fundo ativa.
- **Modo Escuro (Dark Mode):** 
  - Adicionada a capacidade de customizar separadamente as cores (Principal, Secundária e Fundo) para o Modo Escuro.
  - Implementado um seletor no painel Admin para prever a página no "Modo Claro" ou "Modo Escuro".
  - Adicionado um *toggle* (chave liga/desliga) para habilitar o botão de Modo Escuro no site público.
- **Contraste da Hero Section:** Atualizamos os textos (`HeroSection.tsx`) para utilizarem contraste máximo em ambos os modos (Preto total no modo claro, Branco total no modo escuro) com sombras (drop shadows) aplicadas para leitura perfeita em vídeos.

## 2. O Grande Mistério do Deploy (Por que não atualizava?)
Enfrentamos um problema complexo onde o EasyPanel dava "Success" no deploy, mas a versão em produção continuava travada no código antigo (sem a aba Assinaturas desenvolvida pelo Opus e sem o meu Modo Escuro). Nossa investigação profunda revelou três problemas empilhados (efeito bola de neve):

1. **Erro Silencioso de Sintaxe:** Uma tag `</div>` extra no código fez o build falhar dentro do container. Localmente, o TypeScript (`tsc`) não detectava como um impeditivo, mas o empacotador oficial de produção (ESBuild do Vite) abortava a missão no Docker.
2. **Bug de Cache do Nixpacks:** Quando o build falhava, o motor Nixpacks do EasyPanel entrava em ação e encontrava um cache antigo da pasta `dist/` gerado no deploy anterior. Ao invés de ficar com a tela vermelha e avisar do erro, ele "reciclava" o código velho sorrateiramente e publicava o site dizendo `Success`.
3. **Cache de Arquivo do GitHub:** O EasyPanel estava baixando o código do GitHub através de uma integração zip. O GitHub, no entanto, guarda o arquivo `.tar.gz` da branch em cache por até 5 minutos. Disparar o deploy no exato milissegundo após o `git push` fazia o EasyPanel baixar a versão fantasma antiga.
4. **Descompasso de Branches:** Descobrimos que o EasyPanel estava provavelmente buscando atualizações da ramificação `master`, enquanto os desenvolvedores estavam trabalhando e enviando commits novos apenas para a ramificação `main`.

## 3. Soluções Aplicadas e Definitivas
- **Correção do Código:** Localizamos e destruímos a tag `</div>` problemática. O build local agora passa com 100% de precisão.
- **A "Opção Nuclear" contra o Cache:** Alteramos o comando de build no arquivo `package.json` de `"vite build"` para: 
  `"build": "rm -rf dist node_modules/.vite node_modules/.cache && vite build"`
  Isso obriga a máquina do servidor a destruir violentamente qualquer cache anterior e compilar o código do zero absoluto, cortando as asinhas do Nixpacks de tentar reciclar código.
- **Sincronização de Branches:** Fizemos o *merge* e enviamos o código idêntico e completamente atualizado tanto para a branch `main` quanto para a `master`. Isso cobre todas as bases do EasyPanel.
- **Commit Fantasma (Cache Invalidation):** Inserimos uma alteração invisível (`App.tsx`) para forçar a geração de um novo identificador (Hash) no GitHub, estourando o cache do `.zip` preso no servidor deles.

## 4. Próximos Passos (Para a Manhã Seguinte)
1. Abrir o painel do EasyPanel.
2. Clicar no botão verde **Implantar**. (O tempo ocioso da madrugada já terá destruído o cache residual do GitHub).
3. Aguardar o log do console exibir o nosso novo comando agressivo: `> rm -rf dist node_modules/.vite node_modules/.cache && vite build`.
4. Após o Success, recarregar a página de produção com `Ctrl + F5`. As novas abas do painel Admin ("Assinatura", etc.) e as cores de Modo Escuro finalmente tomarão seu lugar de direito na internet.
