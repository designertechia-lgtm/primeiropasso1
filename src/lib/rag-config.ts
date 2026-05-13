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
