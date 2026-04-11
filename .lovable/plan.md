

## Corrigir tabela professional_documents e código

### Situação atual
- Coluna `rag_status` foi deletada do banco
- Coluna `id_vetor` foi adicionada (bigint, nullable) -- para vincular ao vetor e permitir exclusão da linha vetorial
- O código em `AdminDocumentos.tsx` ainda referencia `doc.rag_status` em 2 lugares, causando erro

### Plano

**Passo 1: Recriar coluna `rag_status`**
- Migration: `ALTER TABLE professional_documents ADD COLUMN rag_status text NOT NULL DEFAULT 'pending';`

**Passo 2: Atualizar types.ts**
- Será atualizado automaticamente após a migration

**Passo 3: Atualizar AdminDocumentos.tsx para usar `id_vetor`**
- Na exclusão de documento, antes de deletar o registro em `professional_documents`, verificar se `id_vetor` existe
- Se existir, deletar a linha correspondente na tabela `documents` (WHERE `id_vetor = doc.id_vetor`)
- Isso remove o embedding/vetor associado ao PDF quando o documento for excluído
- Exibir o `id_vetor` no card do documento (se disponível) como referência

**Passo 4: Incluir `id_vetor` no payload do webhook**
- Para que o n8n possa gravar o `id_vetor` de volta no `professional_documents` após processar o RAG

### Arquivos alterados
- Nova migration SQL
- `src/integrations/supabase/types.ts` (auto)
- `src/pages/admin/AdminDocumentos.tsx`

