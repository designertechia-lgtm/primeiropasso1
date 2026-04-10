DROP POLICY IF EXISTS "Blocks are viewable by everyone" ON public.schedule_blocks;
DROP POLICY IF EXISTS "Professionals can manage own blocks" ON public.schedule_blocks;
DROP TABLE public.schedule_blocks;