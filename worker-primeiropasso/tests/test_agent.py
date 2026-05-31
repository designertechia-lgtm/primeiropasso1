"""Tests for agent tool execution."""
import pytest


def test_tool_definitions():
    """Verify available LLM tools — leitura/consulta apenas."""
    from app.agent import TOOLS
    names = [t["function"]["name"] for t in TOOLS]
    assert "buscar_horarios_disponiveis" in names
    assert "consultar_base_conhecimento" in names


def test_criar_agendamento_nao_e_tool_do_llm():
    """#1: o LLM nunca pode confirmar agendamento; isso e deterministico."""
    from app.agent import TOOLS
    names = [t["function"]["name"] for t in TOOLS]
    assert "criar_agendamento" not in names
