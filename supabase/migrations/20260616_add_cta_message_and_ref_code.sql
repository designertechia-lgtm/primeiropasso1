-- Mensagem pré-preenchida editável do botão de agendamento da landing (tab Contatos).
-- null = usa o texto padrão ("Olá! Gostaria de agendar um horário.").
ALTER TABLE professionals ADD COLUMN IF NOT EXISTS contact_cta_message TEXT;

-- Código curto que liga o clique de campanha (utm/gclid) ao lead que chega no
-- WhatsApp: o botão embute "(ref: <ref_code>)" na mensagem; o webhook lê, copia
-- utm/gclid pro lead e remove o marcador do texto.
ALTER TABLE landing_visits ADD COLUMN IF NOT EXISTS ref_code TEXT;
CREATE INDEX IF NOT EXISTS idx_landing_visits_ref_code ON landing_visits(ref_code);
