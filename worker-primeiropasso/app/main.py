from contextlib import asynccontextmanager
from fastapi import FastAPI
from app.webhook import router as webhook_router
from app.social_publisher import router as social_router


@asynccontextmanager
async def lifespan(app: FastAPI):
    yield


app = FastAPI(title="Worker Primeiro Passo", lifespan=lifespan)
app.include_router(webhook_router)
app.include_router(social_router)


@app.get("/health")
async def health():
    return {"status": "ok"}
