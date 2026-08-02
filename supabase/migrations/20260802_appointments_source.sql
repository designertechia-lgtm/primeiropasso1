-- ── Origem do registro, separada da categoria ────────────────────────────────
-- POR QUÊ: a importação do Google Agenda apagava TUDO com block_type='other'
-- antes de reinserir o lote — usava a categoria como marcador de origem. Só que
-- a aba Bloqueios oferece "Outro" como CATEGORIA e grava esse mesmo valor
-- (AdminDisponibilidade/BLOCK_TYPE_OPTIONS), então quem cadastrou "Férias de
-- janeiro" como Outro perdia a série inteira no sync seguinte, sem aviso.
--
-- A partir daqui: `source` diz DE ONDE veio, `block_type` diz O QUE É.
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS source text;

COMMENT ON COLUMN appointments.source IS
  'Origem do registro. ''ical'' = importado do Google Agenda, apagado e recriado
   a cada sincronização. NULL = criado dentro da plataforma, o sync NUNCA toca.';

-- Backfill do lote legado, importado antes desta coluna existir.
--
-- ASSINATURA: um recurrence_group cujos membros têm MAIS DE UM título distinto
-- só pode ter vindo do Google — o bloqueio manual repete o MESMO título em
-- todas as datas da série (ver AdminDisponibilidade/createBlocks, que grava um
-- único `notes` para o lote inteiro).
--
-- A regra é restritiva de propósito, porque os dois erros possíveis não custam
-- o mesmo: deixar de marcar um lote antigo gera duplicata visível na próxima
-- importação (o usuário apaga); marcar um bloqueio manual por engano apagaria
-- trabalho dele no sync seguinte. Na dúvida, não marca.
WITH lotes_do_google AS (
  SELECT recurrence_group
  FROM appointments
  WHERE appointment_type = 'block'
    AND block_type = 'other'
    AND recurrence_group IS NOT NULL
  GROUP BY recurrence_group
  HAVING COUNT(DISTINCT COALESCE(notes, '')) > 1
)
UPDATE appointments a
SET source = 'ical'
FROM lotes_do_google g
WHERE a.recurrence_group = g.recurrence_group
  AND a.appointment_type = 'block'
  AND a.block_type = 'other'
  AND a.source IS NULL;

-- O sync filtra por professional_id + source a cada importação.
CREATE INDEX IF NOT EXISTS idx_appointments_source
  ON appointments (professional_id, source)
  WHERE source IS NOT NULL;
