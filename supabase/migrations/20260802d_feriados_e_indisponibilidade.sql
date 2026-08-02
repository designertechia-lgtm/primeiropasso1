-- ── Feriados: quando o profissional não atende ───────────────────────────────
-- POR QUÊ: "não atendo em feriado" não existia em lugar nenhum, e a única forma
-- de expressar isso era criar bloqueios um a um. Os feriados NACIONAIS são
-- calculados no código (src/lib/holidays.ts) para não vencerem todo ano; aqui
-- ficam só o liga/desliga e as datas próprias (municipais, recesso, pessoais).

ALTER TABLE professionals
  ADD COLUMN IF NOT EXISTS skip_national_holidays boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN professionals.skip_national_holidays IS
  'true = não atende nos feriados nacionais (lista calculada em src/lib/holidays.ts,
   espelhada na edge whatsapp-agent). As datas próprias ficam em professional_holidays.';

CREATE TABLE IF NOT EXISTS public.professional_holidays (
  id bigserial PRIMARY KEY,
  professional_id uuid NOT NULL REFERENCES public.professionals(id) ON DELETE CASCADE,
  date date NOT NULL,
  name text NOT NULL DEFAULT 'Não atendo',
  created_at timestamptz NOT NULL DEFAULT now(),
  -- Uma data aparece uma vez só na agenda de cada profissional.
  UNIQUE (professional_id, date)
);

COMMENT ON TABLE public.professional_holidays IS
  'Datas específicas em que o profissional não atende (feriado municipal, recesso,
   viagem). Vence o feriado nacional do mesmo dia — ver buildHolidayMap.';

CREATE INDEX IF NOT EXISTS idx_professional_holidays_lookup
  ON public.professional_holidays (professional_id, date);

ALTER TABLE public.professional_holidays ENABLE ROW LEVEL SECURITY;

-- Dono gerencia. Mesmo padrão de `appointments`.
DROP POLICY IF EXISTS "Professionals manage own holidays" ON public.professional_holidays;
CREATE POLICY "Professionals manage own holidays"
  ON public.professional_holidays FOR ALL
  USING (EXISTS (
    SELECT 1 FROM public.professionals p
    WHERE p.id = professional_holidays.professional_id AND p.user_id = auth.uid()
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.professionals p
    WHERE p.id = professional_holidays.professional_id AND p.user_id = auth.uid()
  ));

-- Leitura pública: a página de agendamento do paciente é anônima e precisa saber
-- que o dia está fechado para não oferecer horário. Só data e nome — sem PII.
DROP POLICY IF EXISTS "Anyone can read holidays" ON public.professional_holidays;
CREATE POLICY "Anyone can read holidays"
  ON public.professional_holidays FOR SELECT
  USING (true);
