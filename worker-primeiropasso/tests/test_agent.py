"""Tests for agent tool execution."""
import pytest


def test_tool_definitions():
    """Verify all required tools are defined."""
    from app.agent import TOOLS
    names = [t["function"]["name"] for t in TOOLS]
    assert "buscar_horarios_disponiveis" in names
    assert "criar_agendamento" in names
    assert "consultar_base_conhecimento" in names
