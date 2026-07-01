from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.maintenance import router as maintenance_router
from app.rag_router import router as rag_router


@asynccontextmanager
async def lifespan(app: FastAPI):
    yield


app = FastAPI(title="Worker Primeiro Passo", lifespan=lifespan)

# CORS: o front (primeiropasso.online) faz fetch cross-origin pro worker;
# sem isso, o preflight OPTIONS retorna 405 e o navegador bloqueia o POST.
# Regex cobre prod, EasyPanel auto domains e localhost pra dev.
app.add_middleware(
    CORSMiddleware,
    allow_origin_regex=(
        r"^https://([a-z0-9-]+\.)?primeiropasso\.online$"
        r"|^https://[a-z0-9-]+\.easypanel\.host$"
        r"|^http://localhost(:\d+)?$"
    ),
    allow_credentials=False,
    allow_methods=["GET", "POST", "DELETE", "OPTIONS"],
    allow_headers=["Content-Type", "Authorization"],
)

app.include_router(maintenance_router)
app.include_router(rag_router)


@app.get("/health")
async def health():
    return {"status": "ok"}
