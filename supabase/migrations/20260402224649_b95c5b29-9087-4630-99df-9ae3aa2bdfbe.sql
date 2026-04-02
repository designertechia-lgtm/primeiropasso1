CREATE TABLE public.schedule_blocks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  professional_id uuid NOT NULL REFERENCES professionals(id) ON DELETE CASCADE,
  block_date date NOT NULL,
  start_time time NOT NULL,
  end_time time NOT NULL,
  title text DEFAULT 'Bloqueado',
  block_type text NOT NULL DEFAULT 'personal',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.schedule_blocks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Professionals can manage own blocks" ON public.schedule_blocks
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM professionals p WHERE p.id = schedule_blocks.professional_id AND p.user_id = auth.uid()));

CREATE POLICY "Blocks are viewable by everyone" ON public.schedule_blocks
  FOR SELECT USING (true);

CREATE TRIGGER update_schedule_blocks_updated_at
  BEFORE UPDATE ON public.schedule_blocks
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();