

## Revisao de Bugs e Discordancias - AdminDocumentos.tsx

### Bug 1: Cast desnecessario `(doc as any).rag_status` (linha 213)
O tipo `rag_status` ja existe no tipo `professional_documents.Row` do Supabase (`types.ts` linha 309). O cast `as any` e desnecessario e esconde erros de tipo.

**Correção:** Trocar `(doc as any).rag_status || "pending"` por `doc.rag_status`.

### Bug 2: `onDrop` com dependencias incorretas no `useCallback` (linha 129)
O callback `onDrop` chama `handleUpload`, que depende de `professional`, `webhookUrl`, `settings`, e `uploading`. Mas `handleUpload` nao esta nas dependencias do `useCallback`, e como `handleUpload` nao e memoizado, as dependencias listadas nao capturam mudancas corretamente.

**Correção:** Remover o `useCallback` do `onDrop` (nao ha ganho de performance real aqui) ou adicionar `handleUpload` como dependencia com `useCallback` nele tambem.

### Bug 3: `sendWebhook` nao verifica resposta HTTP (linhas 77-81)
O `fetch` so lanca erro em caso de falha de rede. Se o webhook retornar 4xx/5xx, o status ainda sera marcado como "sent".

**Correção:** Adicionar `if (!response.ok) throw new Error()` apos o `fetch`.

### Bug 4: Estado derivado no corpo do componente (linhas 38-39)
Os `if` que setam `webhookUrl` e `webhookLoaded` no corpo do componente sao chamados a cada render. Isso funciona mas e um anti-pattern que pode causar renders extras.

**Correção:** Mover para um `useEffect` com dependencias em `settings` e `webhookLoaded`.

### Bug 5: `sendWebhook` envia `rag_status` inicial no payload? (linha 79)
O plano anterior mencionava incluir `rag_status` no payload do webhook, mas o codigo atual nao envia. Pode ser intencional, mas vale alinhar.

**Correção:** Adicionar `rag_status: "pending"` ao body do webhook se desejado.

### Resumo das alterações
- **Arquivo:** `src/pages/admin/AdminDocumentos.tsx`
  1. Remover `(doc as any)` e usar `doc.rag_status` diretamente
  2. Remover `useCallback` do `onDrop` ou corrigir dependencias
  3. Verificar `response.ok` no `sendWebhook`
  4. Mover logica de `webhookLoaded` para `useEffect`
  5. Adicionar `rag_status` ao payload do webhook

