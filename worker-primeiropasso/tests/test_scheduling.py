"""Testes do parser deterministico de data/hora PT-BR e dos guards (#1)."""
from datetime import date

from app.scheduling import parse_data, parse_hora, quer_confirmar_horario


HOJE = date(2026, 5, 31)  # domingo


def test_parse_data_hoje_amanha():
    assert parse_data("quero hoje", hoje=HOJE) == "2026-05-31"
    assert parse_data("pode ser amanha", hoje=HOJE) == "2026-06-01"
    assert parse_data("depois de amanha", hoje=HOJE) == "2026-06-02"


def test_parse_data_dia_semana_e_numerica():
    # proxima segunda apos domingo 31/05 = 01/06
    assert parse_data("marca na segunda", hoje=HOJE) == "2026-06-01"
    assert parse_data("dia 15/06", hoje=HOJE) == "2026-06-15"
    assert parse_data("10/6", hoje=HOJE) == "2026-06-10"


def test_parse_data_sem_data():
    assert parse_data("oi tudo bem?", hoje=HOJE) is None


def test_parse_hora_formatos():
    assert parse_hora("as 15h") == "15:00"
    assert parse_hora("14:30") == "14:30"
    assert parse_hora("pode ser 9 horas") == "09:00"
    assert parse_hora("às 8") == "08:00"
    assert parse_hora("sem hora aqui") is None


def test_quer_confirmar_horario_positivo():
    assert quer_confirmar_horario("pode ser amanha as 15h") is True
    assert quer_confirmar_horario("quero marcar sexta 10:00") is True
    assert quer_confirmar_horario("amanha as 9h") is True


def test_quer_confirmar_horario_pergunta_nao_confirma():
    assert quer_confirmar_horario("tem horario amanha as 15h?") is False
    assert quer_confirmar_horario("quais horarios voce tem na sexta?") is False
