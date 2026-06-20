-- =============================================================================
-- Axel Agenda via WhatsApp — número pessoal do profissional
--
-- O profissional cadastra um número PESSOAL (celular), diferente do número da
-- instância de negócio. Quando esse número manda mensagem PARA a instância
-- (fromMe=false → o webhook dispara normalmente, ao contrário do self-chat),
-- o whatsapp-webhook reconhece pelo telefone e roteia para o whatsapp-admin-agent
-- (Axel da agenda), em vez do fluxo de lead. Só esse número acessa o Axel da conta.
--
-- Formato canônico: só dígitos COM 55 (ver helper toWhatsAppNumber / nota de
-- identidade por telefone). Comparação no webhook normaliza dos dois lados.
-- =============================================================================
ALTER TABLE public.professionals
  ADD COLUMN IF NOT EXISTS personal_whatsapp text;

COMMENT ON COLUMN public.professionals.personal_whatsapp IS
  'Número pessoal (celular) do profissional para gerenciar a agenda pelo Axel via WhatsApp. Só dígitos com 55. Msg vinda deste número na instância → roteada pro whatsapp-admin-agent (acesso exclusivo do dono).';
