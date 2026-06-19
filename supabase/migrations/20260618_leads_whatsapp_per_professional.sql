-- leads.whatsapp deixa de ser único GLOBAL e passa a ser único POR PROFISSIONAL.
--
-- Bug multi-tenant: com UNIQUE(whatsapp) global, um mesmo telefone só podia ser
-- lead de UM profissional. Quando uma pessoa que já é lead do profissional A
-- mandava mensagem pra instância do profissional B, o webhook tentava criar o
-- lead sob B e batia na constraint única -> "Failed to create lead" -> a mensagem
-- morria sem salvar e sem resposta (Axel "não respondia" na instância nova).
--
-- O webhook já busca/cria o lead filtrando por professional_id, então a chave
-- correta é o par (whatsapp, professional_id).
ALTER TABLE public.leads DROP CONSTRAINT IF EXISTS leads_whatsapp_key;
ALTER TABLE public.leads ADD CONSTRAINT leads_whatsapp_professional_key UNIQUE (whatsapp, professional_id);
