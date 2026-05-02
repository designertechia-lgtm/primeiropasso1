# Worker Primeiro Passo

Worker Python (FastAPI) que substitui os workflows n8n para o projeto Primeiro Passo.

## Setup

```bash
cp .env.example .env
# Preencha as variaveis em .env

# Com Docker:
docker-compose up -d

# Sem Docker:
pip install -e .
uvicorn app.main:app --reload --port 8000
```

## Endpoints

| Metodo | Rota | Descricao |
|--------|------|-----------|
| GET | /health | Health check |
| POST | /webhook/evolution | Webhook EvolutionAPI |
| POST | /cron/publish | Publica posts sociais pendentes |
| POST | /cron/mark-inactive | Marca leads inativos (7+ dias) |

## Cron (VPS)

```
*/5 * * * * curl -sX POST http://localhost:8000/cron/publish
0 3 * * * curl -sX POST http://localhost:8000/cron/mark-inactive
```
