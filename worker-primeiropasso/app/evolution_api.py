import httpx
from app.config import get_settings


async def send_text(instance: str, phone: str, text: str) -> dict:
    s = get_settings()
    url = f"{s.EVOLUTION_API_URL}/message/sendText/{instance}"
    headers = {"apikey": s.EVOLUTION_API_KEY, "Content-Type": "application/json"}
    payload = {"number": phone, "text": text}
    async with httpx.AsyncClient(timeout=30) as client:
        r = await client.post(url, json=payload, headers=headers)
        r.raise_for_status()
        return r.json()
