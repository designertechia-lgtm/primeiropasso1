-- ── Registro de cancelamentos ────────────────────────────────────────────────
-- POR QUÊ: cancelar um agendamento APAGA a linha de `appointments` (decisão de
-- 28/07 — o horário precisa voltar a ficar livre). O efeito colateral é que o
-- cancelamento não deixava rastro: o profissional não tinha como olhar para trás
-- e entender POR QUE as pessoas desmarcam.
--
-- Esta tabela guarda o retrato do que foi cancelado + os campos que o
-- profissional preenche depois (categoria do motivo, observação, "já tratei").

CREATE TABLE IF NOT EXISTS public.appointment_cancellations (
  id bigserial PRIMARY KEY,

  -- Sem FK para appointments de propósito: a linha original é apagada logo em
  -- seguida. O UNIQUE é o que impede registro duplicado do mesmo cancelamento.
  appointment_id uuid NOT NULL UNIQUE,
  professional_id uuid NOT NULL REFERENCES public.professionals(id) ON DELETE CASCADE,

  -- Retrato do agendamento no momento do cancelamento.
  patient_id uuid,
  lead_id uuid,
  service_id uuid,
  client_name text,
  appointment_date date NOT NULL,
  start_time time NOT NULL,
  end_time time NOT NULL,
  previous_status text,
  payment_status text,
  notes text,

  -- Trabalho do profissional sobre o cancelamento.
  cancelled_at timestamptz NOT NULL DEFAULT now(),
  cancelled_by text NOT NULL DEFAULT 'system',
  reason_category text,
  reason_notes text,
  handled boolean NOT NULL DEFAULT false,
  handled_at timestamptz,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.appointment_cancellations IS
  'Histórico de agendamentos cancelados. Alimentada por trigger em appointments
   (DELETE ou status -> cancelled); o motivo é preenchido pelo profissional.';
COMMENT ON COLUMN public.appointment_cancellations.cancelled_by IS
  'professional | patient | system (service role: Axel/WhatsApp, cron)';
COMMENT ON COLUMN public.appointment_cancellations.reason_category IS
  'NULL = ainda não classificado pelo profissional. Rótulos em src/lib/cancellationReasons.ts';

CREATE INDEX IF NOT EXISTS idx_cancellations_prof_data
  ON public.appointment_cancellations (professional_id, cancelled_at DESC);
-- A lista abre filtrada por "ainda não classificados", que é o trabalho pendente.
CREATE INDEX IF NOT EXISTS idx_cancellations_pendentes
  ON public.appointment_cancellations (professional_id)
  WHERE reason_category IS NULL;

-- ── RLS: mesmo padrão de appointments ────────────────────────────────────────
ALTER TABLE public.appointment_cancellations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Professionals can view own cancellations" ON public.appointment_cancellations;
CREATE POLICY "Professionals can view own cancellations"
  ON public.appointment_cancellations FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.professionals p
    WHERE p.id = appointment_cancellations.professional_id AND p.user_id = auth.uid()
  ));

-- Só UPDATE: as linhas nascem pelo trigger, nunca pela mão do usuário.
DROP POLICY IF EXISTS "Professionals can annotate own cancellations" ON public.appointment_cancellations;
CREATE POLICY "Professionals can annotate own cancellations"
  ON public.appointment_cancellations FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM public.professionals p
    WHERE p.id = appointment_cancellations.professional_id AND p.user_id = auth.uid()
  ));

DROP POLICY IF EXISTS "Professionals can delete own cancellations" ON public.appointment_cancellations;
CREATE POLICY "Professionals can delete own cancellations"
  ON public.appointment_cancellations FOR DELETE
  USING (EXISTS (
    SELECT 1 FROM public.professionals p
    WHERE p.id = appointment_cancellations.professional_id AND p.user_id = auth.uid()
  ));

-- ── Gravação automática ──────────────────────────────────────────────────────
-- Por que trigger e não uma chamada no front: existem QUATRO caminhos que
-- encerram um agendamento — a agenda do profissional (DELETE), a lista de
-- agendamentos (DELETE), o paciente desmarcando (UPDATE para 'cancelled') e o
-- Axel no WhatsApp (UPDATE via service role). No banco, um lugar só cobre todos.

CREATE OR REPLACE FUNCTION public.log_appointment_cancellation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  quem text;
  nome text;
BEGIN
  -- Bloqueio de horário não é cancelamento de atendimento, e a sincronização do
  -- Google apaga o lote inteiro a cada clique — os dois poluiriam a lista.
  IF COALESCE(OLD.appointment_type, 'booking') <> 'booking' THEN RETURN OLD; END IF;
  IF OLD.source = 'ical' THEN RETURN OLD; END IF;

  -- Quem puxou o gatilho. Sem auth.uid() = service role (Axel, cron, edge).
  IF auth.uid() IS NULL THEN
    quem := 'system';
  ELSIF auth.uid() = OLD.patient_id THEN
    quem := 'patient';
  ELSE
    quem := 'professional';
  END IF;

  -- Nome do cliente: perfil cadastrado > lead > o que foi digitado em notes.
  SELECT COALESCE(
    (SELECT pr.full_name FROM profiles pr WHERE pr.user_id = OLD.patient_id),
    (SELECT l.name FROM leads l WHERE l.id = OLD.lead_id),
    NULLIF(TRIM(OLD.notes), '')
  ) INTO nome;

  INSERT INTO appointment_cancellations (
    appointment_id, professional_id, patient_id, lead_id, service_id, client_name,
    appointment_date, start_time, end_time, previous_status, payment_status, notes,
    cancelled_by
  ) VALUES (
    OLD.id, OLD.professional_id, OLD.patient_id, OLD.lead_id, OLD.service_id, nome,
    OLD.appointment_date, OLD.start_time, OLD.end_time,
    OLD.status::text, OLD.payment_status::text, OLD.notes,
    quem
  )
  -- Cancelar (status) e depois apagar é um cancelamento só, não dois.
  ON CONFLICT (appointment_id) DO NOTHING;

  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_log_cancellation_on_delete ON public.appointments;
CREATE TRIGGER trg_log_cancellation_on_delete
  BEFORE DELETE ON public.appointments
  FOR EACH ROW EXECUTE FUNCTION public.log_appointment_cancellation();

-- O paciente e o Axel cancelam mudando o status, sem apagar a linha.
DROP TRIGGER IF EXISTS trg_log_cancellation_on_status ON public.appointments;
CREATE TRIGGER trg_log_cancellation_on_status
  AFTER UPDATE OF status ON public.appointments
  FOR EACH ROW
  WHEN (NEW.status = 'cancelled' AND OLD.status IS DISTINCT FROM 'cancelled')
  EXECUTE FUNCTION public.log_appointment_cancellation();

-- updated_at automático nas anotações.
CREATE OR REPLACE FUNCTION public.touch_cancellation_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  -- Marcar como tratado carimba a hora sozinho.
  IF NEW.handled AND NOT OLD.handled THEN NEW.handled_at := now();
  ELSIF NOT NEW.handled THEN NEW.handled_at := NULL;
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_touch_cancellation ON public.appointment_cancellations;
CREATE TRIGGER trg_touch_cancellation
  BEFORE UPDATE ON public.appointment_cancellations
  FOR EACH ROW EXECUTE FUNCTION public.touch_cancellation_updated_at();

-- ── Backfill dos cancelados que ainda estão na tabela ────────────────────────
-- São os registros de antes de "cancelar = excluir" (23 no banco em 02/08/2026).
-- `updated_at` é a melhor aproximação da hora do cancelamento que existe.
INSERT INTO appointment_cancellations (
  appointment_id, professional_id, patient_id, lead_id, service_id, client_name,
  appointment_date, start_time, end_time, previous_status, payment_status, notes,
  cancelled_at, cancelled_by
)
SELECT
  a.id, a.professional_id, a.patient_id, a.lead_id, a.service_id,
  COALESCE(
    (SELECT pr.full_name FROM profiles pr WHERE pr.user_id = a.patient_id),
    (SELECT l.name FROM leads l WHERE l.id = a.lead_id),
    NULLIF(TRIM(a.notes), '')
  ),
  a.appointment_date, a.start_time, a.end_time, 'cancelled', a.payment_status::text, a.notes,
  a.updated_at, 'system'
FROM appointments a
WHERE a.status = 'cancelled'
  AND COALESCE(a.appointment_type, 'booking') = 'booking'
ON CONFLICT (appointment_id) DO NOTHING;
