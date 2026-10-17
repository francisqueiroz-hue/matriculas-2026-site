"""
Calendário do TJSP (core/calendario_tjsp.py).

O conjunto de 2026 abaixo foi escrito à mão a partir do art. 1º do Provimento CSM
nº 2.813/2025 e do Provimento CSM nº 2.845/2026 (lidos em 13/10/2026), sem usar o
módulo testado.
"""
import os
import sys
from datetime import date, timedelta

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from core import calendario_tjsp as tjsp  # noqa: E402
from core import calendarios  # noqa: E402
from core.calendar_prazos import calcular_prazo, eh_dia_util  # noqa: E402

# Dias da SEMANA sem expediente em 2026 (art. 1º do Prov. 2.813/2025, com a troca do Prov. 2.845/2026).
_TJSP_2026 = {
    date(2026, 1, 1), date(2026, 1, 2), date(2026, 1, 5), date(2026, 1, 6),   # 01/01 e recesso 02 a 06/01
    date(2026, 2, 16), date(2026, 2, 17),                                     # Carnaval
    date(2026, 4, 2), date(2026, 4, 3),                                       # Endoenças; Paixão
    date(2026, 4, 20), date(2026, 4, 21),                                     # suspensão; Tiradentes
    date(2026, 5, 1), date(2026, 6, 4), date(2026, 6, 5),                     # Trabalho; Corpus Christi; suspensão
    date(2026, 7, 9), date(2026, 7, 10),                                      # Data Magna; suspensão
    date(2026, 9, 7), date(2026, 10, 12), date(2026, 10, 30),                 # Independência; Aparecida; Servidor
    date(2026, 11, 2), date(2026, 11, 20),                                    # Finados; Consciência Negra
    date(2026, 12, 7), date(2026, 12, 8),                                     # suspensão; Dia da Justiça
    *(date(2026, 12, d) for d in (21, 22, 23, 24, 25, 28, 29, 30, 31)),       # recesso 20 a 31/12
}
_TJSP_2027_JAN = {date(2027, 1, 1), date(2027, 1, 4), date(2027, 1, 5), date(2027, 1, 6)}


def _util(d):
    return d.weekday() < 5 and d not in _TJSP_2026 and d not in _TJSP_2027_JAN


def test_2026_conjunto_exato():
    obtido = {d for d in tjsp.dias_nao_uteis(2026) if d.weekday() < 5}
    assert obtido == _TJSP_2026, f"a mais: {sorted(obtido - _TJSP_2026)} | a menos: {sorted(_TJSP_2026 - obtido)}"


def test_varredura_2026_contra_o_oraculo():
    d, fim = date(2026, 1, 1), date(2026, 12, 31)
    while d <= fim:
        assert eh_dia_util(d, tribunal="TJSP") == _util(d), d
        d += timedelta(days=1)


def test_perfil_cadastrado_nao_e_reserva():
    nome, mod, reserva = calendarios.resolver("TJSP")
    assert (nome, reserva) == ("TJSP", False) and mod is tjsp
    assert calendarios.resolver("tjsp")[2] is False


def test_dia_do_servidor_30_10_nao_28_10():
    assert eh_dia_util(date(2026, 10, 28), tribunal="TJSP")
    assert not eh_dia_util(date(2026, 10, 30), tribunal="TJSP")


def test_quarta_de_cinzas_e_util_com_ressalva():
    assert eh_dia_util(date(2026, 2, 18), tribunal="TJSP")
    # disp ter 17/02 (Carnaval, não útil) -> sem prazo contado em 18/02? pub = 1º dia útil seguinte = qua 18/02
    r = calcular_prazo(date(2026, 2, 13), 1, tribunal="TJSP")
    # sex 13/02: pub seg 16/02? (Carnaval) -> ter 17/02 (Carnaval) -> qua 18/02; início qui 19/02; vence qui 19/02
    assert (r["data_publicacao"], r["data_inicio_prazo"], r["data_limite"]) == (
        date(2026, 2, 18), date(2026, 2, 19), date(2026, 2, 19))
    assert any("Cinzas" in a for a in r["avisos"])


def test_quinta_santa_e_dia_sem_expediente():
    assert not eh_dia_util(date(2026, 4, 2), tribunal="TJSP")
    assert eh_dia_util(date(2026, 4, 1), tribunal="TJSP")      # quarta-feira santa é útil no TJSP


def test_prazo_com_data_magna_difere_do_tjrj():
    # qua 08/07/2026: TJSP: 09/07 (Data Magna) e 10/07 (suspensão) não úteis -> pub seg 13/07, início ter 14/07
    tj = calcular_prazo(date(2026, 7, 8), 3, tribunal="TJSP")
    assert (tj["data_publicacao"], tj["data_inicio_prazo"], tj["data_limite"]) == (
        date(2026, 7, 13), date(2026, 7, 14), date(2026, 7, 16))
    # TJRJ: 09/07 e 10/07 são úteis -> pub qui 09/07, início sex 10/07 -> vence ter 14/07
    rj = calcular_prazo(date(2026, 7, 8), 3, tribunal="TJRJ")
    assert (rj["data_publicacao"], rj["data_inicio_prazo"], rj["data_limite"]) == (
        date(2026, 7, 9), date(2026, 7, 10), date(2026, 7, 14))


def test_prazo_atravessando_o_dia_do_servidor():
    # ter 27/10: pub qua 28/10 (útil no TJSP), início qui 29/10; 29/10 (1), 30/10 e 02/11 não úteis, 03/11 (2), 04/11 (3)
    r = calcular_prazo(date(2026, 10, 27), 3, tribunal="TJSP")
    assert (r["data_publicacao"], r["data_inicio_prazo"], r["data_limite"]) == (
        date(2026, 10, 28), date(2026, 10, 29), date(2026, 11, 4))
    assert any("2.845/2026" in a for a in r["avisos"])


def test_suspensao_de_20_04_e_tiradentes():
    # sex 17/04: seg 20/04 suspensão, ter 21/04 Tiradentes -> pub qua 22/04, início qui 23/04 (São Jorge não é feriado em SP)
    r = calcular_prazo(date(2026, 4, 17), 3, tribunal="TJSP")
    assert (r["data_publicacao"], r["data_inicio_prazo"], r["data_limite"]) == (
        date(2026, 4, 22), date(2026, 4, 23), date(2026, 4, 27))


def test_capital_25_de_janeiro():
    assert tjsp.dias_nao_uteis_capital(2027) == {date(2027, 1, 25): "Aniversário da cidade de São Paulo"}
    # qui 21/01/2027: pub sex 22/01; interior: início seg 25/01 -> vence seg 25/01; capital: 25/01 é feriado -> ter 26/01
    interior = calcular_prazo(date(2027, 1, 21), 1, tribunal="TJSP", capital=False)
    capital = calcular_prazo(date(2027, 1, 21), 1, tribunal="TJSP", capital=True)
    assert interior["data_limite"] == date(2027, 1, 25)
    assert capital["data_limite"] == date(2027, 1, 26)


def test_ano_sem_ato_avisa():
    r = calcular_prazo(date(2027, 3, 1), 3, tribunal="TJSP")
    assert any("2027" in a for a in r["avisos"])
    assert r["calendario_reserva"] is False


def test_recesso_20_12_a_06_01():
    for d in (date(2026, 12, 21), date(2026, 12, 31), date(2027, 1, 1), date(2027, 1, 6)):
        assert not eh_dia_util(d, tribunal="TJSP"), d
    assert eh_dia_util(date(2027, 1, 7), tribunal="TJSP")
    assert eh_dia_util(date(2027, 1, 20), tribunal="TJSP")      # sem aplicar_recesso
