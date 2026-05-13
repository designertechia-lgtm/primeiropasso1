-- Reescreve match_documents_for_professional com definição limpa e versionada.
--
-- Contexto: a função original foi criada manualmente no setup n8n (não versionada).
-- Em 13/05/2026 ela retornava 0 chunks mesmo com queries semanticamente próximas
-- ao conteúdo, bloqueando o smoke test do /rag/search. Esta migration substitui
-- a versão antiga por uma implementação enxuta que:
--   1. Filtra por metadata->>'professional_id' (mesmo campo que o worker insere
--      em rag_ingest.py)
--   2. Usa cosine distance (<=>) — assume índice ivfflat/hnsw em embedding
--   3. Roda como SECURITY DEFINER pra bypassar RLS quando chamada pelo worker

-- Drop todas as assinaturas possíveis da versão antiga, pra não conflitar
DROP FUNCTION IF EXISTS public.match_documents_for_professional(uuid, vector, int);
DROP FUNCTION IF EXISTS public.match_documents_for_professional(uuid, vector, integer);
DROP FUNCTION IF EXISTS public.match_documents_for_professional(uuid, text, int);
DROP FUNCTION IF EXISTS public.match_documents_for_professional(uuid, text, integer);
DROP FUNCTION IF EXISTS public.match_documents_for_professional(uuid, vector);
DROP FUNCTION IF EXISTS public.match_documents_for_professional(uuid, text);

CREATE OR REPLACE FUNCTION public.match_documents_for_professional(
  p_professional_id uuid,
  query_embedding vector(1536),
  match_count int DEFAULT 5
)
RETURNS TABLE (content text, similarity float)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    d.content,
    1 - (d.embedding <=> query_embedding) AS similarity
  FROM public.documents d
  WHERE d.metadata->>'professional_id' = p_professional_id::text
  ORDER BY d.embedding <=> query_embedding
  LIMIT GREATEST(match_count, 1);
$$;

COMMENT ON FUNCTION public.match_documents_for_professional IS
  'Busca semantica de chunks RAG filtrados por professional_id (em metadata.professional_id). '
  'Usa cosine distance do pgvector. Retorna content + similarity (0-1, maior = mais similar). '
  'Definida em migration 20260513173500.';

GRANT EXECUTE ON FUNCTION public.match_documents_for_professional(uuid, vector(1536), int)
  TO authenticated, service_role, anon;
