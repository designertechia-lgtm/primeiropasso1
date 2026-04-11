CREATE TRIGGER trg_update_professional_document_id
AFTER INSERT ON public.documents
FOR EACH ROW
EXECUTE FUNCTION public.update_professional_document_id();