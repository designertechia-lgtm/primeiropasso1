-- ============================================================
-- Produtos e Serviços do profissional (Fase 1: vitrine)
-- Tabela de produtos vendáveis (ebook/PDF, físico, serviço avulso),
-- bucket privado para os arquivos (entrega protegida virá na Fase 2)
-- e RLS espelhando professional_services (leitura pública + dono gerencia).
-- Idempotente: pode ser reaplicada sem erro.
-- ============================================================

-- 1. Tabela
CREATE TABLE IF NOT EXISTS public.professional_products (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  professional_id UUID NOT NULL REFERENCES public.professionals(id) ON DELETE CASCADE,
  kind            TEXT NOT NULL DEFAULT 'ebook'
                    CHECK (kind IN ('ebook','physical','service','other')),
  title           TEXT NOT NULL,
  description     TEXT,
  price_brl       NUMERIC(10,2),          -- null = "sob consulta"
  cover_image_url TEXT,                   -- capa (bucket público 'images')
  file_path       TEXT,                   -- caminho no bucket privado 'product-files' (entrega Fase 2)
  external_url    TEXT,                   -- link externo opcional (flexibilidade)
  active           BOOLEAN NOT NULL DEFAULT true,
  sort_order       INTEGER NOT NULL DEFAULT 0,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.professional_products ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_professional_products_owner
  ON public.professional_products (professional_id, active, sort_order);

-- updated_at automático (mesma função usada por articles/videos)
DROP TRIGGER IF EXISTS update_professional_products_updated_at ON public.professional_products;
CREATE TRIGGER update_professional_products_updated_at
  BEFORE UPDATE ON public.professional_products
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2. RLS (espelha professional_services: vitrine é pública; só o dono gerencia)
DROP POLICY IF EXISTS "Products are viewable by everyone" ON public.professional_products;
CREATE POLICY "Products are viewable by everyone"
  ON public.professional_products FOR SELECT USING (true);

DROP POLICY IF EXISTS "Professionals can manage own products" ON public.professional_products;
CREATE POLICY "Professionals can manage own products"
  ON public.professional_products FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.professionals p
      WHERE p.id = professional_id AND p.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.professionals p
      WHERE p.id = professional_id AND p.user_id = auth.uid()
    )
  );

-- 3. Bucket privado para os arquivos vendáveis (ex.: PDF do ebook).
-- Privado de propósito: na Fase 2 a entrega será por signed URL pós-pagamento.
INSERT INTO storage.buckets (id, name, public)
VALUES ('product-files', 'product-files', false)
ON CONFLICT (id) DO NOTHING;

-- Cada profissional só acessa os arquivos dentro da própria pasta (path = "<user.id>/...").
DROP POLICY IF EXISTS "product_files_owner_read" ON storage.objects;
CREATE POLICY "product_files_owner_read"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'product-files' AND (storage.foldername(name))[1] = auth.uid()::text);

DROP POLICY IF EXISTS "product_files_owner_insert" ON storage.objects;
CREATE POLICY "product_files_owner_insert"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'product-files' AND (storage.foldername(name))[1] = auth.uid()::text);

DROP POLICY IF EXISTS "product_files_owner_update" ON storage.objects;
CREATE POLICY "product_files_owner_update"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'product-files' AND (storage.foldername(name))[1] = auth.uid()::text);

DROP POLICY IF EXISTS "product_files_owner_delete" ON storage.objects;
CREATE POLICY "product_files_owner_delete"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'product-files' AND (storage.foldername(name))[1] = auth.uid()::text);
