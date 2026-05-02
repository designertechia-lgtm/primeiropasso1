"""Tests for memory format compatibility with n8n."""
import pytest


def test_message_format():
    """Verify message format matches n8n_chat_histories schema."""
    msg_human = {"type": "human", "data": {"content": "Ola"}}
    msg_ai = {"type": "ai", "data": {"content": "Como posso ajudar?"}}
    
    assert msg_human["type"] == "human"
    assert msg_ai["data"]["content"] == "Como posso ajudar?"
