"""
Chat memory compatible with n8n_chat_histories table.
session_id = WhatsApp phone number (e.g. "5511999999999")
message format: {"type": "human"|"ai", "data": {"content": "..."}}
"""
import json
from app.db import get_supabase


def save_message(session_id: str, role: str, content: str) -> None:
    msg_type = "ai" if role == "assistant" else "human"
    message = {"type": msg_type, "data": {"content": content}}
    get_supabase().table("n8n_chat_histories").insert({
        "session_id": session_id,
        "message": message,
    }).execute()


def get_history(session_id: str, limit: int = 20) -> list[dict]:
    result = (
        get_supabase()
        .table("n8n_chat_histories")
        .select("*")
        .eq("session_id", session_id)
        .order("id", desc=True)
        .limit(limit)
        .execute()
    )
    rows = list(reversed(result.data or []))
    messages = []
    for row in rows:
        msg = row.get("message", {})
        if isinstance(msg, str):
            msg = json.loads(msg)
        role = "assistant" if msg.get("type") == "ai" else "user"
        messages.append({"role": role, "content": msg.get("data", {}).get("content", "")})
    return messages
