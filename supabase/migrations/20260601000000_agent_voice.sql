-- Voz do agente WhatsApp: permite o profissional responder leads em áudio
-- com a própria voz clonada (ElevenLabs). Usado pela edge whatsapp-webhook (G4).

-- Liga/desliga respostas em áudio do agente para este profissional.
ALTER TABLE professionals ADD COLUMN IF NOT EXISTS agent_voice_enabled boolean NOT NULL DEFAULT false;

-- voice_id da voz clonada no ElevenLabs (retornado por elevenlabs-proxy?action=clone).
ALTER TABLE professionals ADD COLUMN IF NOT EXISTS agent_voice_id text;
