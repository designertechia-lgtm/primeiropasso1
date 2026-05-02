"""Webhook endpoint for EvolutionAPI events."""
import logging
from fastapi import APIRouter, Request, BackgroundTasks
from app.flow_control import is_flow_disabled, is_agent_enabled
from app.anti_flood import should_process
from app.message_router import route_message
from app.agent import run_agent
from app.evolution_api import send_text
from app.tools.professional import get_professional_by_phone

logger = logging.getLogger(__name__)
router = APIRouter()


async def _handle_message(instance: str, phone: str, msg_type: str, data: dict):
    try:
        if is_flow_disabled(phone):
            logger.info(f"Flow disabled for {phone}, skipping")
            return

        if not is_agent_enabled(phone):
            logger.info(f"Agent disabled for {phone}, skipping")
            return

        if not should_process(phone):
            logger.info(f"Anti-flood: skipping duplicate for {phone}")
            return

        pro = get_professional_by_phone(phone)
        if not pro:
            logger.warning(f"No professional found for phone {phone}")
            return

        text = await route_message(msg_type, data)
        if not text.strip():
            return

        reply = await run_agent(phone, text, pro["id"])
        if reply:
            await send_text(instance, phone, reply)

    except Exception:
        logger.exception(f"Error processing message from {phone}")


@router.post("/webhook/evolution")
async def webhook_evolution(request: Request, bg: BackgroundTasks):
    body = await request.json()
    
    event = body.get("event")
    if event != "messages.upsert":
        return {"status": "ignored"}

    data = body.get("data", {})
    key = data.get("key", {})
    
    if key.get("fromMe", False):
        return {"status": "ignored"}

    phone = key.get("remoteJid", "").replace("@s.whatsapp.net", "")
    instance = body.get("instance", "")
    msg_type = data.get("messageType", "conversation")
    message = data.get("message", {})

    bg.add_task(_handle_message, instance, phone, msg_type, {
        "body": message.get("conversation", message.get("extendedTextMessage", {}).get("text", "")),
        "mediaUrl": data.get("mediaUrl", ""),
        "caption": message.get("imageMessage", {}).get("caption", ""),
    })

    return {"status": "queued"}
