CREATE OR REPLACE FUNCTION public.update_professional_document_id()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  raw_data TEXT;
  doc_id TEXT;
  doc_file_url TEXT;
  rows_affected INT;
BEGIN
  raw_data := NEW.metadata->>'data';

  -- Extrair Documento_id do texto
  IF raw_data ~ 'Documento_id:([0-9a-fA-F-]{36})' THEN
    doc_id := (regexp_match(raw_data, 'Documento_id:([0-9a-fA-F-]{36})'))[1];
  END IF;

  -- Extrair file_url do texto
  IF raw_data ~ 'file_url:(https?://[^,\s\.]+\.[^\s,]+)' THEN
    doc_file_url := (regexp_match(raw_data, 'file_url:(https?://[^\s,]+\.[^\s,]+)'))[1];
    doc_file_url := rtrim(doc_file_url, '.');
  END IF;

  -- Match por document_id (UUID) - mais preciso
  IF doc_id IS NOT NULL THEN
    UPDATE professional_documents
    SET id_vector = NEW.id_vector, rag_status = 'completed'
    WHERE id = doc_id::uuid;
    GET DIAGNOSTICS rows_affected = ROW_COUNT;
  END IF;

  -- Fallback: match por file_url
  IF (rows_affected IS NULL OR rows_affected = 0) AND doc_file_url IS NOT NULL THEN
    UPDATE professional_documents
    SET id_vector = NEW.id_vector, rag_status = 'completed'
    WHERE file_url = doc_file_url;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_update_professional_document_id ON public.documents;
CREATE TRIGGER trg_update_professional_document_id
AFTER INSERT ON public.documents
FOR EACH ROW
EXECUTE FUNCTION public.update_professional_document_id();