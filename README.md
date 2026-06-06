# Primeiro Passo

Plataforma para terapeutas e profissionais de saúde: landing page personalizada, criação de conteúdo (artigos, vídeos, Estúdio Viral), CRM/WhatsApp e publicação em redes sociais.

## Stack
- **Front:** React + Vite + TypeScript + Tailwind/shadcn
- **Backend:** Supabase (Postgres, Auth, Edge Functions) + worker Python (`worker-primeiropasso/`)
- **Vídeo:** `video-api` (repositório separado, em `../video-api`)

## Rodar localmente
```bash
npm install
npm run dev
```
- Variáveis do front: `.env` (somente `VITE_*`).
- Secrets das edge functions: **Supabase → Edge Functions → Secrets** (não vão no `.env`).

## Documentação por frente
- **Redes sociais** (conexão OAuth, auditoria e campanhas): [`src/components/admin/redes-sociais/README.md`](src/components/admin/redes-sociais/README.md)
