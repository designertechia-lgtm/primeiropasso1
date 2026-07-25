-- Coluna de descrição do agendamento/bloqueio, separada do "notes" (que hoje
-- funciona como título do bloqueio ou observação da consulta). Usada para
-- guardar o DESCRIPTION do VEVENT importado do Google Agenda (iCal).
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS description text;
