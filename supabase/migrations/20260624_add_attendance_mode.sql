-- Modalidade de atendimento do profissional (online | presencial | ambos).
-- Default 'online' => todos os profissionais existentes ficam online ("por enquanto", decisão do Carlos 24/06).
-- Aditiva e segura: NOT NULL com DEFAULT preenche as linhas existentes na hora.
-- Consumido pela edge whatsapp-agent (buildProfileLayer) e editável em AdminPerfil.
ALTER TABLE professionals
  ADD COLUMN IF NOT EXISTS attendance_mode text NOT NULL DEFAULT 'online'
  CHECK (attendance_mode IN ('online','presencial','ambos'));
