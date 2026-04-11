ALTER TABLE public.professional_documents
ADD COLUMN rag_status text NOT NULL DEFAULT 'pending';