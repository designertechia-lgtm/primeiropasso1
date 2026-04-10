

## Tela de Upload de Documentos PDF com Webhook n8n

### O que será feito

Criar uma nova página no painel admin (`/admin/documentos`) onde o profissional pode:
1. Fazer upload de PDFs para o Supabase Storage
2. Ver a lista de documentos já enviados
3. Configurar a URL do webhook n8n (teste ou produção)
4. Ao subir um PDF, o link público é enviado automaticamente via POST para o webhook configurado

### Passo 1: Criar bucket `documents` no Storage
Migration SQL para criar o bucket e policies de acesso (profissional pode upload/delete seus próprios arquivos, leitura pública).

### Passo 2: Criar tabela `professional_documents`
Armazena os metadados dos PDFs enviados e a URL do webhook por profissional:

| Coluna | Tipo |
|--------|------|
| id | uuid PK |
| professional_id | uuid |
| file_name | text |
| file_url | text |
| file_size | bigint |
| webhook_status | text (pending/sent/error) |
| created_at | timestamptz |

### Passo 3: Criar tabela `professional_settings` (ou adicionar coluna)
Armazena a URL do webhook n8n por profissional:

| Coluna | Tipo |
|--------|------|
| id | uuid PK |
| professional_id | uuid (unique) |
| webhook_url | text |

Com RLS para o profissional gerenciar seus próprios dados.

### Passo 4: Criar página `AdminDocumentos.tsx`
- Card superior: campo editável para a URL do webhook com botão salvar
- Área de upload de PDF (drag & drop ou botão)
- Ao fazer upload: salva no Storage, registra na tabela, envia POST para o webhook com `{ file_url, file_name, professional_id }`
- Lista de documentos já enviados com status do webhook (enviado/erro) e botão para reenviar
- Botão para deletar documento

### Passo 5: Adicionar rota e link no sidebar
- Nova rota `/admin/documentos` no `App.tsx`
- Novo item "Documentos" no `DashboardSidebar.tsx` com ícone `FileUp`

### Detalhes técnicos
- Upload usa `supabase.storage.from("documents").upload(...)` com path `{user_id}/pdfs/{timestamp}.pdf`
- Webhook é chamado via `fetch(webhookUrl, { method: 'POST', body: JSON.stringify({ file_url, file_name }) })`
- Accept apenas `application/pdf` no input de arquivo
- Limite de 20MB por arquivo

