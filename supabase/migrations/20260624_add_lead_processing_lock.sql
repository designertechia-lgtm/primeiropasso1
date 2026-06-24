-- Lock por lead pro webhook do WhatsApp: impede tasks concorrentes de processar o MESMO lead
-- em paralelo (causa do loop de respostas repetidas quando o agente demora).
-- Convenção: processing_until no PASSADO (epoch) = livre; no FUTURO = travado até aquele instante.
-- O lock expira sozinho (a task que adquire seta now()+Xs); se a task morrer, libera no tempo.
ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS processing_until timestamptz NOT NULL DEFAULT '1970-01-01T00:00:00Z';
