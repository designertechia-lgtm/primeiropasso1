

## Criar trigger para atualizar id_vector e limpeza de storage na exclusão

### Situação atual
- A função `update_professional_document_id()` já existe no banco e faz o correto: quando um registro é inserido na tabela `documents`, ela busca o `file_url` no campo `metadata->>'data'` e atualiza `id_vector` e `rag_status = 'completed'` na `professional_documents`.
- **Problema**: Nenhum trigger está vinculado a essa função. Ela nunca é executada.
- A exclusão de arquivos do Storage já é feita no código frontend (`AdminDocumentos.tsx`), mas a exclusão da linha vetorial na tabela `documents` precisa usar `id_vector` corretamente.

### Plano

**Passo 1: Criar trigger na tabela `documents`**
Migration SQL:
```sql
CREATE TRIGGER trg_update_professional_document_id
AFTER INSERT ON public.documents
FOR EACH ROW
EXECUTE FUNCTION public.update_professional_document_id();
```
Isso faz com que, sempre que o n8n inserir um vetor na tabela `documents`, a função existente seja acionada automaticamente para atualizar `id_vector` e `rag_status` na `professional_documents`.

**Passo 2: Corrigir exclusão vetorial no frontend**
No `AdminDocumentos.tsx`, a exclusão já tenta deletar da tabela `documents` usando `id_vetor`. Preciso verificar se o campo de match está correto (`id_vector` é a PK da tabela `documents`, tipo `bigint`). A query deve ser:
```typescript
await supabase.from("documents").delete().eq("id_vector", doc.id_vetor);
```

**Passo 3 (opcional): Criar trigger para deletar arquivo do Storage automaticamente**
Quando um registro de `professional_documents` for deletado, um trigger pode extrair o path do `file_url` e chamar `storage.delete`. Porém, o Storage API não é acessível via SQL puro de forma simples. O frontend já faz essa limpeza, então isso é opcional. Se preferir, posso criar uma edge function para isso.

### Arquivos alterados
- Nova migration SQL (criar trigger)
- Verificação/ajuste em `src/pages/admin/AdminDocumentos.tsx` (se necessário)

### Resultado esperado
Quando o n8n inserir um vetor na tabela `documents` com `metadata->>'data'` contendo o `file_url`, o trigger vai automaticamente preencher `id_vector` e marcar `rag_status = 'completed'` na `professional_documents`. Na exclusão, o frontend já remove o arquivo do Storage e a linha vetorial.

