"""Routes incoming messages by type to the appropriate handler."""
import httpx
from openai import OpenAI
from app.config import get_settings


async def process_text(text: str) -> str:
    return text


async def process_audio(audio_url: str) -> str:
    """Download audio and transcribe with OpenAI Whisper."""
    client = OpenAI(api_key=get_settings().OPENAI_API_KEY)
    async with httpx.AsyncClient(timeout=60) as http:
        r = await http.get(audio_url)
        r.raise_for_status()

    import tempfile
    import os
    with tempfile.NamedTemporaryFile(suffix=".ogg", delete=False) as f:
        f.write(r.content)
        tmp_path = f.name

    try:
        with open(tmp_path, "rb") as audio_file:
            transcript = client.audio.transcriptions.create(
                model="whisper-1",
                file=audio_file,
                language="pt",
            )
        return transcript.text
    finally:
        os.unlink(tmp_path)


async def process_image(image_url: str, caption: str = "") -> str:
    """Analyze image with GPT-4o Vision."""
    client = OpenAI(api_key=get_settings().OPENAI_API_KEY)
    messages = [
        {
            "role": "user",
            "content": [
                {"type": "text", "text": caption or "Descreva esta imagem em portugues."},
                {"type": "image_url", "image_url": {"url": image_url}},
            ],
        }
    ]
    response = client.chat.completions.create(
        model="gpt-4o",
        messages=messages,
        max_tokens=500,
    )
    return response.choices[0].message.content or ""


async def route_message(msg_type: str, data: dict) -> str:
    """Route message by type, return extracted text content."""
    if msg_type == "conversation":
        return await process_text(data.get("body", ""))
    elif msg_type == "audioMessage":
        return await process_audio(data.get("mediaUrl", ""))
    elif msg_type == "imageMessage":
        return await process_image(
            data.get("mediaUrl", ""),
            data.get("caption", ""),
        )
    else:
        return data.get("body", data.get("caption", ""))
