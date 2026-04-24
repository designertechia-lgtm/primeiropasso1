ALTER TABLE public.articles
  ADD COLUMN cover_image_url TEXT,
  ADD COLUMN carousel_items JSONB DEFAULT '[]'::jsonb;

ALTER TABLE public.articles
  DROP COLUMN image_url;
