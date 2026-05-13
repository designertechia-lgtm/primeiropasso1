/**
 * RAG worker endpoint — infra compartilhada da plataforma.
 *
 * Para sobrescrever em build (dev/staging/prod), defina `VITE_RAG_INGEST_URL`
 * no arquivo `.env` ou `.env.local` antes de `npm run dev` / `npm run build`.
 *
 * Exemplos:
 *   # .env.local (dev)
 *   VITE_RAG_INGEST_URL=http://localhost:8000/rag/ingest
 *
 *   # .env.production
 *   VITE_RAG_INGEST_URL=https://worker.primeiropasso.online/rag/ingest
 */
export const RAG_INGEST_URL: string =
  (import.meta.env.VITE_RAG_INGEST_URL as string | undefined) ??
  "https://worker.primeiropasso.online/rag/ingest";

// Base do worker derivada da URL de ingest: usado por outros endpoints (/rag/documents/{id}, etc.)
const RAG_BASE_URL: string = RAG_INGEST_URL.replace(/\/rag\/ingest\/?$/, "");

export const ragDeleteUrl = (documentId: string): string =>
  `${RAG_BASE_URL}/rag/documents/${encodeURIComponent(documentId)}`;
