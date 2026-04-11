

## Melhorar tela de Documentos: exclusão, links e status vetorial

### Problema
A tela atual mostra apenas status do webhook (pendente/enviado/erro). Falta visibilidade sobre o status do processamento RAG (vetorização) e os links completos dos documentos.

### O que será feito

**1. Nova coluna `rag_status` na tabela `professional_documents`**
- Valores: `pending`, `processing`, `completed`, `error`
- Default: `pending`
- O n8n pode atualizar esse campo via Supabase quando o RAG finalizar

**2. Melhorar a UI da lista de documentos**
- Mostrar link completo do arquivo (copiável com botão)
- Mostrar dois badges de status separados: **Webhook** e **Vetorial (RAG)**
- Confirmação antes de excluir (dialog)
- Exibir o `document_id` para referência

**3. Incluir `rag_status` no payload do webhook**
- Para que o n8n saiba qual campo atualizar de volta

### Detalhes técnicos

**Migration:**
```sql
ALTER TABLE public.professional_documents
ADD COLUMN rag_status text NOT NULL DEFAULT 'pending';
```

**UI por documento:**
```text
┌──────────────────────────────────────────────────┐
│ 📄 nome-do-arquivo.pdf                           │
│ 1.2 MB • 10/04/2026                             │
│ ID: abc-123-def                                  │
│ Link: https://...supabase.co/...  [Copiar]       │
│ Webhook: ✅ Enviado  |  RAG: ⏳ Pendente         │
│                          [Reenviar] [Excluir]    │
└──────────────────────────────────────────────────┘
```

**Arquivos alterados:**
- Nova migration SQL (adicionar `rag_status`)
- `src/pages/admin/AdminDocumentos.tsx` (UI completa com links, status vetorial, confirmação de exclusão)
- `src/integrations/supabase/types.ts` (atualizado automaticamente)

