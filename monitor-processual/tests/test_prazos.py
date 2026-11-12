"""
Testes da contagem de prazo.

Estes testes existem por um motivo concreto: até a v2 TODO prazo saía 1 dia
útil atrasado, e ninguém percebeu porque não havia teste nenhum. Rode
`python -m pytest tests -q` (ou `python tests/test_prazos.py`) depois de
qualquer alteração em core/calendar_prazos.py.
"""
import os
import sys
from datetime import date, datetime, timedelta

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import pytest  # noqa: E402

from core.calendar_prazos import (  # noqa: E402
    calcular_prazo,
    data_inicio_prazo,
    data_publicacao,
    dias_uteis_ate,
    eh_dia_util,
    somar_dias_corridos,
    somar_dias_uteis,
)
from core import calendario_tjrj as cal  # noqa: E402
from core.datas import para_data  # noqa: E402


# --- O caso de referência, com datas fechadas -------------------------------
# publicação 10/09/2018 (segunda) -> 1º dia 11/09 -> 15 dias úteis -> 01/10/2018
def test_caso_referencia_15_dias_uteis():
    assert somar_dias_uteis(date(2018, 9, 11), 15) == date(2018, 10, 1)


def test_pipeline_completo_bate_com_o_caso_referencia():
    # 07/09/2018 (sexta, feriado) -> publicação na segunda 10/09
    r = calcular_prazo(date(2018, 9, 7), 15, "uteis")
    assert r["data_publicacao"] == date(2018, 9, 10)
    assert r["data_inicio_prazo"] == date(2018, 9, 11)
    assert r["data_limite"] == date(2018, 10, 1)


# --- A regra que estava invertida na v2 -------------------------------------
def test_dia_de_inicio_conta_como_primeiro_dia():
    # 2026-03-04 é quarta-feira, dia útil
    assert somar_dias_uteis(date(2026, 3, 4), 1) == date(2026, 3, 4)
    assert somar_dias_uteis(date(2026, 3, 4), 2) == date(2026, 3, 5)
    assert somar_dias_uteis(date(2026, 3, 4), 3) == date(2026, 3, 6)
    # pula o fim de semana
    assert somar_dias_uteis(date(2026, 3, 4), 4) == date(2026, 3, 9)


def test_corridos_tambem_contam_o_primeiro_dia():
    assert somar_dias_corridos(date(2026, 3, 4), 1) == date(2026, 3, 4)
    # 04/03 + 14 = 18/03/2026 (quarta)
    assert somar_dias_corridos(date(2026, 3, 4), 15) == date(2026, 3, 18)


def test_corridos_prorrogam_vencimento_em_dia_nao_util():
    # 05/03/2026 + 2 dias corridos = 06/03 (sexta); +3 = 07/03 (sábado) -> 09/03
    assert somar_dias_corridos(date(2026, 3, 5), 3) == date(2026, 3, 9)


# --- Feriados que a v2 contava como dia útil --------------------------------
def test_carnaval_nao_e_dia_util():
    assert not eh_dia_util(date(2026, 2, 16))  # segunda de carnaval
    assert not eh_dia_util(date(2026, 2, 17))  # terça de carnaval


def test_corpus_christi_nao_e_dia_util():
    assert not eh_dia_util(date(2026, 6, 4))


def test_sexta_feira_santa_e_feriado_nacional():
    assert not eh_dia_util(date(2026, 4, 3))


def test_feriado_forense_extra_e_respeitado():
    extra = {date(2026, 3, 5)}
    assert eh_dia_util(date(2026, 3, 5)) is True
    assert eh_dia_util(date(2026, 3, 5), extra) is False
    # com 05/03 bloqueado, o 2º dia útil a partir de 04/03 passa a ser 06/03
    assert somar_dias_uteis(date(2026, 3, 4), 2, extra) == date(2026, 3, 6)


# --- Recesso do art. 220 ----------------------------------------------------
def test_prazo_que_cruza_recesso_gera_aviso():
    r = calcular_prazo(date(2026, 12, 10), 15, "uteis")
    assert r["avisos"], "deveria avisar sobre a faixa 20/12-20/01"
    assert "220" in r["avisos"][0]


def test_com_recesso_ligado_o_vencimento_e_mais_tarde():
    sem = calcular_prazo(date(2026, 12, 10), 15, "uteis", aplicar_recesso=False)
    com = calcular_prazo(date(2026, 12, 10), 15, "uteis", aplicar_recesso=True)
    assert com["data_limite"] > sem["data_limite"]
    assert not any("220" in a for a in com["avisos"])


# --- Parser de datas (a causa da perda silenciosa na v2) --------------------
def test_parser_aceita_formato_brasileiro():
    assert para_data("01/09/2026") == date(2026, 9, 1)


def test_parser_aceita_iso_com_hora_e_fuso():
    assert para_data("2026-09-01T00:00:00Z") == date(2026, 9, 1)
    assert para_data("2026-09-01 10:30:00") == date(2026, 9, 1)


def test_parser_devolve_none_em_vez_de_explodir():
    assert para_data("sem data") is None
    assert para_data("") is None
    assert para_data(None) is None


# =============================================================================
# REGRA DO DJEN — publicação e início do prazo
# -----------------------------------------------------------------------------
# Lei 11.419/2006, art. 4º, §§ 3º e 4º (e Res. CNJ 455/2022; no CPC, art. 224,
# §§ 2º e 3º):
#   * publicação  = 1º dia ÚTIL seguinte ao da disponibilização;
#   * início do prazo = 1º dia ÚTIL seguinte ao da publicação.
# As datas abaixo foram conferidas à mão no calendário de 2026 (nenhuma foi
# gerada pelo próprio código testado). Dia da semana entre parênteses.
# =============================================================================

def _pub_ini(disp, extras=None):
    return data_publicacao(disp, extras), data_inicio_prazo(data_publicacao(disp, extras), extras)


def test_disponibilizacao_em_dia_comum_quinta():
    # qui 05/03 -> pub sex 06/03 -> início seg 09/03 (publicação na sexta: o
    # início salta o fim de semana)
    assert _pub_ini(date(2026, 3, 5)) == (date(2026, 3, 6), date(2026, 3, 9))


def test_disponibilizacao_na_segunda_e_na_terca():
    # seg 09/03 -> pub ter 10/03 -> início qua 11/03
    assert _pub_ini(date(2026, 3, 9)) == (date(2026, 3, 10), date(2026, 3, 11))
    # ter 10/03 -> pub qua 11/03 -> início qui 12/03
    assert _pub_ini(date(2026, 3, 10)) == (date(2026, 3, 11), date(2026, 3, 12))


def test_disponibilizacao_na_sexta_publica_na_segunda():
    # sex 06/03 -> pub seg 09/03 -> início ter 10/03
    assert _pub_ini(date(2026, 3, 6)) == (date(2026, 3, 9), date(2026, 3, 10))


def test_disponibilizacao_no_sabado_e_no_domingo():
    # sáb 07/03 e dom 08/03 -> pub seg 09/03 -> início ter 10/03
    assert _pub_ini(date(2026, 3, 7)) == (date(2026, 3, 9), date(2026, 3, 10))
    assert _pub_ini(date(2026, 3, 8)) == (date(2026, 3, 9), date(2026, 3, 10))


def test_disponibilizacao_em_feriado_nao_conta_como_dia_da_publicacao():
    # sex 03/04/2026 (Sexta-feira Santa) -> pub seg 06/04 -> início ter 07/04
    assert _pub_ini(date(2026, 4, 3)) == (date(2026, 4, 6), date(2026, 4, 7))


def test_vespera_de_feriado_quinta_antes_da_sexta_santa():
    # qui 02/04 (véspera da Sexta Santa, sex 03/04) -> a publicação pula o
    # feriado e o fim de semana: seg 06/04 -> início ter 07/04
    assert _pub_ini(date(2026, 4, 2)) == (date(2026, 4, 6), date(2026, 4, 7))


def test_vespera_de_feriado_segunda_antes_de_tiradentes():
    # seg 20/04 (véspera de Tiradentes, ter 21/04) -> pub qua 22/04.
    # No TJRJ, qui 23/04 (São Jorge, Lei est. 5.198/2008) e sex 24/04 (ponto
    # facultativo, Ato Executivo 79/2026) não são úteis: início seg 27/04.
    assert _pub_ini(date(2026, 4, 20)) == (date(2026, 4, 22), date(2026, 4, 27))
    # no próprio feriado: ter 21/04 -> pub qua 22/04 -> início seg 27/04
    assert _pub_ini(date(2026, 4, 21)) == (date(2026, 4, 22), date(2026, 4, 27))


def test_sexta_antes_de_feriado_na_segunda_7_de_setembro():
    # sex 04/09 (seg 07/09 é feriado) -> pub ter 08/09 -> início qua 09/09
    assert _pub_ini(date(2026, 9, 4)) == (date(2026, 9, 8), date(2026, 9, 9))


def test_vespera_de_corpus_christi():
    # qua 03/06 (Corpus Christi é qui 04/06; sex 05/06 é ponto facultativo com
    # expediente e prazos suspensos — Ato Executivo 91/2026) -> pub seg 08/06
    # -> início ter 09/06
    assert _pub_ini(date(2026, 6, 3)) == (date(2026, 6, 8), date(2026, 6, 9))


def test_vespera_do_natal_quinta_24_12():
    # qui 24/12 (Natal é sex 25/12; depois vem o fim de semana) ->
    # pub seg 28/12 -> início ter 29/12 (comportamento padrão, sem recesso)
    assert _pub_ini(date(2026, 12, 24)) == (date(2026, 12, 28), date(2026, 12, 29))


def test_feriado_forense_extra_desloca_publicacao_e_inicio():
    # sex 06/03 com seg 09/03 forense -> pub ter 10/03 -> início qua 11/03
    assert _pub_ini(date(2026, 3, 6), {date(2026, 3, 9)}) == (
        date(2026, 3, 10),
        date(2026, 3, 11),
    )
    # qui 05/03 com sex 06/03 forense -> pub seg 09/03 -> início ter 10/03
    assert _pub_ini(date(2026, 3, 5), {date(2026, 3, 6)}) == (
        date(2026, 3, 9),
        date(2026, 3, 10),
    )


def test_pipeline_completo_dias_uteis_partindo_de_sexta():
    # sex 06/03 -> pub seg 09/03 -> início ter 10/03
    # 5 dias úteis: 10, 11, 12, 13, 16/03 -> vence seg 16/03
    r = calcular_prazo(date(2026, 3, 6), 5, "uteis")
    assert r["data_publicacao"] == date(2026, 3, 9)
    assert r["data_inicio_prazo"] == date(2026, 3, 10)
    assert r["data_limite"] == date(2026, 3, 16)
    assert r["avisos"] == []


def test_pipeline_completo_dias_corridos_partindo_de_sexta():
    # início ter 10/03; 15 dias corridos contando o 1º -> ter 24/03 (dia útil)
    r = calcular_prazo(date(2026, 3, 6), 15, "corridos")
    assert r["data_inicio_prazo"] == date(2026, 3, 10)
    assert r["data_limite"] == date(2026, 3, 24)


def test_pipeline_corridos_prorroga_vencimento_em_fim_de_semana():
    # início ter 10/03; 5 corridos -> sáb 14/03 -> prorroga para seg 16/03
    r = calcular_prazo(date(2026, 3, 6), 5, "corridos")
    assert r["data_limite"] == date(2026, 3, 16)
    # 4 corridos -> sex 13/03 (dia útil, não prorroga)
    assert calcular_prazo(date(2026, 3, 6), 4, "corridos")["data_limite"] == date(2026, 3, 13)


def test_pipeline_respeita_forense_extra_na_contagem():
    # sex 06/03, forense seg 09/03 -> pub ter 10/03 -> início qua 11/03
    # 3 dias úteis: 11, 12, 13/03 -> vence sex 13/03
    r = calcular_prazo(date(2026, 3, 6), 3, "uteis", feriados_extras={date(2026, 3, 9)})
    assert r["data_inicio_prazo"] == date(2026, 3, 11)
    assert r["data_limite"] == date(2026, 3, 13)


def test_prazo_de_1_dia_util_vence_no_proprio_dia_de_inicio():
    r = calcular_prazo(date(2026, 3, 6), 1, "uteis")
    assert r["data_limite"] == r["data_inicio_prazo"] == date(2026, 3, 10)


def test_n_dias_invalido_levanta_erro():
    for n in (0, -1):
        with pytest.raises(ValueError):
            somar_dias_uteis(date(2026, 3, 4), n)
        with pytest.raises(ValueError):
            somar_dias_corridos(date(2026, 3, 4), n)


def test_inicio_em_dia_nao_util_e_empurrado_para_o_proximo_dia_util():
    # sáb 07/03 passado como início: o 1º dia é seg 09/03
    assert somar_dias_uteis(date(2026, 3, 7), 1) == date(2026, 3, 9)


# --- Recesso do art. 220 com datas fechadas ---------------------------------
# disp qui 10/12/2026 -> pub sex 11/12 -> início seg 14/12.
def test_recesso_desligado_cruzando_20_12_vencimento_exato():
    # 8 dias úteis: 14-18/12 (5), 21, 22, 23/12 (8) -> qua 23/12/2026.
    # A faixa 20/12-20/01 foi tocada (o 21-23/12 está dentro dela) -> aviso.
    r = calcular_prazo(date(2026, 12, 10), 8, "uteis", aplicar_recesso=False)
    assert r["data_inicio_prazo"] == date(2026, 12, 14)
    assert r["data_limite"] == date(2026, 12, 23)
    assert r["avisos"] and "220" in r["avisos"][0]


def test_recesso_ligado_vencimento_exato():
    # 8 dias úteis: 14-18/12 (5); recesso até 20/01; 21/01 (6), 22/01 (7),
    # 25/01 (8) -> seg 25/01/2027. Sem aviso (a suspensão já foi aplicada).
    r = calcular_prazo(date(2026, 12, 10), 8, "uteis", aplicar_recesso=True)
    assert r["data_limite"] == date(2027, 1, 25)
    assert not any("220" in a for a in r["avisos"])
    # 15 dias úteis: ... 21, 22, 25-29/01 (12), 01, 02, 03/02 (15) -> qua 03/02/2027
    r15 = calcular_prazo(date(2026, 12, 10), 15, "uteis", aplicar_recesso=True)
    assert r15["data_limite"] == date(2027, 2, 3)


def test_prazo_fora_da_faixa_do_recesso_nao_gera_aviso():
    r = calcular_prazo(date(2026, 3, 6), 15, "uteis")
    assert r["avisos"] == []


# --- Oráculo INDEPENDENTE do calendário do TJRJ -----------------------------
# Escrito à mão a partir do art. 83 da Lei estadual 10.633/2024 e dos
# informativos oficiais do TJRJ (atualizados em 11/09 e 05/10/2026). NÃO usa
# core.calendario_tjrj nem a biblioteca `holidays`. Só dias úteis da semana.
_ESTADO_2026 = {
    date(2026, 1, 1),                                        # Confraternização Universal
    date(2026, 2, 13),                                       # ponto facultativo — Ato Executivo 20
    date(2026, 2, 16), date(2026, 2, 17), date(2026, 2, 18),  # Carnaval — art. 83, III
    date(2026, 2, 27),                                       # prazos suspensos — Ato Executivo 60
    date(2026, 4, 2), date(2026, 4, 3),                      # Semana Santa — art. 83, IV
    date(2026, 4, 21),                                       # Tiradentes
    date(2026, 4, 23),                                       # São Jorge — Lei est. 5.198/2008
    date(2026, 4, 24),                                       # ponto facultativo — Ato Executivo 79
    date(2026, 5, 1),                                        # Dia do Trabalhador
    date(2026, 6, 4),                                        # Corpus Christi — Lei est. 11.002/2025
    date(2026, 6, 5),                                        # ponto facultativo — Ato Executivo 91
    date(2026, 6, 24),                                       # expediente reduzido — Ato Executivo 96
    date(2026, 6, 29),                                       # ponto facultativo — Ato Executivo 103
    date(2026, 7, 29),                                       # prazos suspensos — Ato Executivo 116
    date(2026, 8, 7),                                        # expediente reduzido — Ato Executivo 129
    date(2026, 8, 11),                                       # prazos suspensos — Ato Executivo 114
    date(2026, 9, 7),                                        # Independência
    date(2026, 10, 12),                                      # Nossa Senhora Aparecida
    date(2026, 11, 2),                                       # Finados
    date(2026, 11, 20),                                      # Consciência Negra
    date(2026, 12, 8),                                       # Dia da Justiça — art. 83, I
    date(2026, 12, 25),                                      # Natal
}
# 2027: só o que decorre de lei (o TJRJ ainda não publicou atos de 2027).
_ESTADO_2027 = {
    date(2027, 1, 1),
    date(2027, 2, 8), date(2027, 2, 9), date(2027, 2, 10),   # Carnaval (seg-qua)
    date(2027, 3, 25), date(2027, 3, 26),                    # Quinta e Sexta Santa
    date(2027, 4, 21), date(2027, 4, 23),                    # Tiradentes; São Jorge
    date(2027, 5, 27),                                       # Corpus Christi
    date(2027, 9, 7), date(2027, 10, 12), date(2027, 11, 2),
    date(2027, 11, 15), date(2027, 12, 8),
}
# Só Capital: São Sebastião (Lei Orgânica do Rio, art. 26) e atos da Capital.
_CAPITAL = {
    date(2026, 1, 20), date(2026, 9, 4), date(2026, 9, 11), date(2027, 1, 20),
}


def _util2(d, capital=False, extras=frozenset()):
    if d.weekday() >= 5:
        return False
    if d in _ESTADO_2026 or d in _ESTADO_2027 or d in extras:
        return False
    return not (capital and d in _CAPITAL)


def _seguinte_util(d, capital=False, extras=frozenset()):
    d += timedelta(days=1)
    while not _util2(d, capital, extras):
        d += timedelta(days=1)
    return d


def _rec(d):
    return (d.month == 12 and d.day >= 20) or (d.month == 1 and d.day <= 20)


def _oraculo_limite(inicio, n, tipo, recesso, capital=False):
    ok = lambda c: _util2(c, capital) and not (recesso and _rec(c))  # noqa: E731
    if tipo == "uteis":
        c = inicio
        while not ok(c):
            c += timedelta(days=1)
        restantes = n - 1
        while restantes:
            c += timedelta(days=1)
            restantes -= ok(c)
        return c
    c = inicio - timedelta(days=1)
    restantes = n
    while restantes:
        c += timedelta(days=1)
        if not (recesso and _rec(c)):
            restantes -= 1
    while not ok(c):
        c += timedelta(days=1)
    return c


def _semana(conj):
    return {d for d in conj if d.weekday() < 5}


def test_calendario_2026_conjunto_exato():
    """Auditoria: o calendário do módulo tem EXATAMENTE os dias úteis da
    semana listados nos informativos — nenhum a mais, nenhum a menos."""
    obtido = _semana(cal.dias_nao_uteis(2026))
    assert obtido == _semana(_ESTADO_2026), (
        f"a mais: {sorted(obtido - _semana(_ESTADO_2026))} | "
        f"a menos: {sorted(_semana(_ESTADO_2026) - obtido)}"
    )
    cap = _semana(d for d in _CAPITAL if d.year == 2026)
    assert _semana(cal.dias_nao_uteis_capital(2026)) == cap


def test_calendario_2027_conjunto_exato_so_legal():
    obtido = _semana(cal.dias_nao_uteis(2027))
    assert obtido == _semana(_ESTADO_2027), (
        f"a mais: {sorted(obtido - _semana(_ESTADO_2027))} | "
        f"a menos: {sorted(_semana(_ESTADO_2027) - obtido)}"
    )
    assert _semana(cal.dias_nao_uteis_capital(2027)) == _semana(
        d for d in _CAPITAL if d.year == 2027
    )


def test_pascoa_confere_com_tabela_conhecida():
    tabela = {
        2024: date(2024, 3, 31), 2025: date(2025, 4, 20), 2026: date(2026, 4, 5),
        2027: date(2027, 3, 28), 2028: date(2028, 4, 16), 2029: date(2029, 4, 1),
        2030: date(2030, 4, 21), 2031: date(2031, 4, 13), 2032: date(2032, 3, 28),
        2033: date(2033, 4, 17), 2034: date(2034, 4, 9), 2035: date(2035, 3, 25),
    }
    for ano, esperado in tabela.items():
        assert cal.pascoa(ano) == esperado, ano
        assert cal.pascoa(ano).weekday() == 6, f"Páscoa {ano} não é domingo"


def test_feriados_moveis_2025_a_2035_a_partir_da_pascoa_conhecida():
    tabela = {
        2025: date(2025, 4, 20), 2026: date(2026, 4, 5), 2027: date(2027, 3, 28),
        2028: date(2028, 4, 16), 2029: date(2029, 4, 1), 2030: date(2030, 4, 21),
        2031: date(2031, 4, 13), 2032: date(2032, 3, 28), 2033: date(2033, 4, 17),
        2034: date(2034, 4, 9), 2035: date(2035, 3, 25),
    }
    for ano, p in tabela.items():
        esperado = {
            p - timedelta(days=48), p - timedelta(days=47), p - timedelta(days=46),  # Carnaval + Cinzas
            p - timedelta(days=3), p - timedelta(days=2),                            # Quinta e Sexta Santa
            p + timedelta(days=60),                                                 # Corpus Christi
            date(ano, 1, 1), date(ano, 4, 21), date(ano, 4, 23), date(ano, 5, 1),
            date(ano, 9, 7), date(ano, 10, 12), date(ano, 11, 2), date(ano, 11, 15),
            date(ano, 11, 20), date(ano, 12, 8), date(ano, 12, 25),
        }
        obtido = set(cal.feriados_estatutarios(ano))
        assert obtido == esperado, (
            f"{ano}: a mais {sorted(obtido - esperado)} | a menos {sorted(esperado - obtido)}"
        )


def test_feriados_publicos_da_biblioteca_holidays_estao_no_calendario():
    """Verificação cruzada: todo feriado PÚBLICO da biblioteca `holidays`
    (Brasil, sem a categoria OPTIONAL) tem que ser não útil aqui."""
    holidays = pytest.importorskip("holidays")
    for ano in range(2025, 2036):
        for d, nome in holidays.Brazil(years=ano).items():
            if d.weekday() < 5:
                assert not eh_dia_util(d), f"{d} ({nome}) deveria ser não útil"


def test_dias_que_a_biblioteca_classificava_errado_no_tjrj():
    # Antes (holidays OPTIONAL): 28/10, 24/12 e 31/12 eram "não úteis" sem base
    # no TJRJ; Quinta Santa, São Jorge e Dia da Justiça eram "úteis" apesar do
    # art. 83 e da Lei est. 5.198/2008.
    for d in (date(2026, 10, 28), date(2026, 12, 24), date(2026, 12, 31)):
        assert eh_dia_util(d), f"{d} é dia útil no TJRJ (não consta nos informativos)"
    for d in (date(2026, 4, 2), date(2026, 4, 23), date(2026, 12, 8), date(2026, 2, 18)):
        assert not eh_dia_util(d), f"{d} é dia sem expediente no TJRJ"


def test_semana_santa_so_quinta_e_sexta_no_tjrj():
    assert eh_dia_util(date(2026, 4, 1))          # quarta-feira: há expediente
    assert not eh_dia_util(date(2026, 4, 2))      # quinta — art. 83, IV
    assert not eh_dia_util(date(2026, 4, 3))      # sexta — art. 83, IV


def test_prorrogacoes_nao_tornam_o_dia_nao_util():
    # Atos Executivos 24 (05/02) e 73 (27/03): só movem prazos de processos
    # eletrônicos que começam/vencem no dia; a contagem normal segue.
    assert eh_dia_util(date(2026, 2, 5))
    assert eh_dia_util(date(2026, 3, 27))


def test_atos_cadastrados_sao_consistentes():
    efeitos = {"sem_expediente", "prazos_suspensos", "expediente_reduzido", "prorrogacao"}
    for ano, atos in cal.ATOS.items():
        vistos = set()
        for a in atos:
            assert a.data.year == ano, a
            assert a.efeito in efeitos and a.escopo in {"estado", "capital"}, a
            assert (a.data, a.escopo) not in vistos, f"duplicado: {a}"
            vistos.add((a.data, a.escopo))
            assert a.ato and a.publicacao, f"sem referência normativa: {a}"
            if a.efeito != "prorrogacao":
                assert a.data.weekday() < 5, f"{a.data} cai em fim de semana: {a}"
    assert set(cal.ANOS_COM_ATOS) <= set(cal.ATOS)


def test_invariantes_publicacao_inicio_e_vencimento_em_2026():
    """Para TODA disponibilização de 01/01 a 30/11/2026 (interior e Capital):
    publicação e início são o 1º dia útil estritamente seguinte, e o
    vencimento é o N-ésimo dia útil contando o início — contagem independente."""
    for capital in (False, True):
        d = date(2026, 1, 1)
        while d <= date(2026, 11, 30):
            pub = _seguinte_util(d, capital)
            ini = _seguinte_util(pub, capital)
            for n in (1, 5, 15):
                r = calcular_prazo(d, n, "uteis", capital=capital)
                assert r["data_publicacao"] == pub, f"pub errada p/ disp {d} capital={capital}"
                assert r["data_inicio_prazo"] == ini, f"início errado p/ disp {d} capital={capital}"
                lim = r["data_limite"]
                assert _util2(lim, capital), f"vencimento {lim} não é dia útil (disp {d}, n={n})"
                contados, c = 0, ini
                while c <= lim:
                    contados += _util2(c, capital)
                    c += timedelta(days=1)
                assert contados == n, f"disp {d}, n={n}, capital={capital}: contou {contados}"
            d += timedelta(days=1)


# =============================================================================
# REGRESSÕES DA AUDITORIA (versão corrigida de core/calendar_prazos.py)
# Seis destes testes (tipo_contagem, corridos+recesso, datetime e a varredura)
# FALHAM no módulo anterior à auditoria; os demais são guardas de regressão.
# =============================================================================

def test_auditoria_tipo_contagem_desconhecido_nao_vira_dias_uteis():
    # Antes: qualquer valor != "corridos" era contado como dias úteis, em
    # silêncio ("Corridos" vencia em 30/03 em vez de 24/03 — 6 dias tarde).
    for invalido in ("corrido", "calendario", "", None, 15):
        with pytest.raises(ValueError):
            calcular_prazo(date(2026, 3, 6), 15, invalido)


def test_auditoria_tipo_contagem_aceita_caixa_e_acento():
    corridos = calcular_prazo(date(2026, 3, 6), 15, "corridos")["data_limite"]
    assert corridos == date(2026, 3, 24)
    for v in ("Corridos", "CORRIDOS", "  corridos "):
        assert calcular_prazo(date(2026, 3, 6), 15, v)["data_limite"] == corridos
    uteis = calcular_prazo(date(2026, 3, 6), 15, "uteis")["data_limite"]
    assert uteis == date(2026, 3, 30)
    for v in ("úteis", "Úteis", "UTEIS"):
        assert calcular_prazo(date(2026, 3, 6), 15, v)["data_limite"] == uteis


def test_auditoria_corridos_respeitam_recesso_quando_ligado():
    # disp qui 10/12/2026 -> início seg 14/12. 15 dias corridos:
    # 14-19/12 (6), recesso 20/12-20/01 não conta, 21-29/01 (15) -> sex 29/01/2027.
    r = calcular_prazo(date(2026, 12, 10), 15, "corridos", aplicar_recesso=True)
    assert r["data_inicio_prazo"] == date(2026, 12, 14)
    assert r["data_limite"] == date(2027, 1, 29)
    assert not any("220" in a for a in r["avisos"])


def test_auditoria_corridos_recesso_desligado_mantem_aviso():
    r = calcular_prazo(date(2026, 12, 10), 15, "corridos", aplicar_recesso=False)
    assert r["data_limite"] == date(2026, 12, 28)
    assert r["avisos"] and "220" in r["avisos"][0]


def test_auditoria_corridos_prorrogacao_nao_para_dentro_do_recesso():
    # início seg 14/12; 6 dias corridos -> sáb 19/12 (não útil). O próximo dia
    # útil "comum" seria seg 21/12, mas está suspenso: vence qui 21/01/2027.
    r = calcular_prazo(date(2026, 12, 10), 6, "corridos", aplicar_recesso=True)
    assert r["data_limite"] == date(2027, 1, 21)


def test_auditoria_datetime_e_tratado_como_date():
    # Antes: datetime nunca casava com o conjunto de feriados e a Sexta Santa
    # (03/04/2026) virava dia útil; o resultado também saía como datetime.
    assert eh_dia_util(datetime(2026, 4, 3, 10, 0)) is False
    com_hora = calcular_prazo(datetime(2026, 4, 2, 9, 30), 5, "uteis")
    sem_hora = calcular_prazo(date(2026, 4, 2), 5, "uteis")
    assert com_hora == sem_hora
    assert type(com_hora["data_publicacao"]) is date
    assert type(com_hora["data_limite"]) is date
    # qui 02/04 -> pub seg 06/04 -> início ter 07/04 -> 5 úteis -> seg 13/04
    assert sem_hora["data_limite"] == date(2026, 4, 13)


def test_auditoria_dias_uteis_ate_aceita_datetime():
    assert dias_uteis_ate(datetime(2026, 3, 6, 18, 0), datetime(2026, 3, 4, 9, 0)) == 3


# --- Varredura contra calculador INDEPENDENTE (dez/2026 a jan/2027) ----------
def test_auditoria_varredura_dezembro_janeiro_todos_os_modos():
    for capital in (False, True):
        d = date(2026, 12, 1)
        while d <= date(2027, 1, 31):
            pub = _seguinte_util(d, capital)
            ini = _seguinte_util(pub, capital)
            for n in (1, 2, 5, 10, 15, 30):
                for tipo in ("uteis", "corridos"):
                    for recesso in (False, True):
                        r = calcular_prazo(d, n, tipo, aplicar_recesso=recesso, capital=capital)
                        esperado = _oraculo_limite(ini, n, tipo, recesso, capital)
                        assert r["data_publicacao"] == pub
                        assert r["data_inicio_prazo"] == ini
                        assert r["data_limite"] == esperado, (
                            f"disp {d} n={n} {tipo} recesso={recesso} capital={capital}: "
                            f"código {r['data_limite']} x esperado {esperado}"
                        )
            d += timedelta(days=1)


# =============================================================================
# CALENDÁRIO DO TJRJ — casos com datas fechadas (conferidas nos informativos)
# =============================================================================

def test_tjrj_semana_santa_2026_desloca_vencimento():
    # seg 30/03 -> pub ter 31/03 -> início qua 01/04.
    # 3 dias úteis: 01/04 (1), [02 e 03/04 Semana Santa], 06/04 (2), 07/04 (3).
    r = calcular_prazo(date(2026, 3, 30), 3, "uteis")
    assert (r["data_publicacao"], r["data_inicio_prazo"]) == (date(2026, 3, 31), date(2026, 4, 1))
    assert r["data_limite"] == date(2026, 4, 7)


def test_tjrj_vencimento_atravessa_tiradentes_sao_jorge_e_ponto_facultativo():
    # qui 09/04 -> pub sex 10/04 -> início seg 13/04. 10 dias úteis:
    # 13,14,15,16,17,20 (6), [21 Tiradentes], 22 (7), [23 São Jorge, 24 ponto
    # facultativo], 27 (8), 28 (9), 29 (10) -> qua 29/04/2026.
    r = calcular_prazo(date(2026, 4, 9), 10, "uteis")
    assert r["data_inicio_prazo"] == date(2026, 4, 13)
    assert r["data_limite"] == date(2026, 4, 29)


def test_tjrj_dia_da_justica_8_de_dezembro():
    # seg 07/12 -> ter 08/12 (Dia da Justiça) não é útil -> pub qua 09/12 -> início qui 10/12
    assert _pub_ini(date(2026, 12, 7)) == (date(2026, 12, 9), date(2026, 12, 10))


def test_tjrj_28_de_outubro_e_dia_util():
    # ter 27/10 -> pub qua 28/10 (útil: não consta nos informativos) -> início qui 29/10
    assert _pub_ini(date(2026, 10, 27)) == (date(2026, 10, 28), date(2026, 10, 29))


def test_tjrj_capital_x_interior_em_04_e_11_de_setembro():
    # qui 03/09. Interior: pub sex 04/09 (útil) -> início ter 08/09 (07/09 feriado)
    # -> 5 úteis: 08, 09, 10, 11, 14 -> seg 14/09; sem aviso.
    i = calcular_prazo(date(2026, 9, 3), 5, "uteis", capital=False)
    assert (i["data_publicacao"], i["data_inicio_prazo"]) == (date(2026, 9, 4), date(2026, 9, 8))
    assert i["data_limite"] == date(2026, 9, 14)
    assert i["avisos"] == []
    # Capital: 04/09 (Ato 159) e 11/09 (Ato 162) com prazos suspensos.
    # pub ter 08/09 -> início qua 09/09 -> 5 úteis: 09, 10, [11], 14, 15, 16 -> qua 16/09.
    c = calcular_prazo(date(2026, 9, 3), 5, "uteis", capital=True)
    assert (c["data_publicacao"], c["data_inicio_prazo"]) == (date(2026, 9, 8), date(2026, 9, 9))
    assert c["data_limite"] == date(2026, 9, 16)
    assert any("04/09/2026" in a for a in c["avisos"])


def test_tjrj_aviso_de_expediente_reduzido_em_ato_estadual():
    # ter 23/06 -> qua 24/06 (jogo do Brasil, 11h-15h, prazos suspensos) é não
    # útil -> pub qui 25/06 -> início sex 26/06, com aviso explicando.
    r = calcular_prazo(date(2026, 6, 23), 5, "uteis")
    assert (r["data_publicacao"], r["data_inicio_prazo"]) == (date(2026, 6, 25), date(2026, 6, 26))
    assert any("24/06/2026" in a for a in r["avisos"])


def test_tjrj_aviso_quando_o_ano_nao_tem_atos_cadastrados():
    r = calcular_prazo(date(2027, 3, 1), 5, "uteis")
    assert any("2027" in a and "cadastrados" in a for a in r["avisos"])
    r26 = calcular_prazo(date(2026, 3, 6), 5, "uteis")
    assert not any("cadastrados" in a for a in r26["avisos"])


def test_tjrj_sao_sebastiao_20_01_so_para_a_capital_com_recesso_desligado():
    # ter 20/01/2027 é feriado municipal do Rio (só Capital). qua 13/01 + 5 úteis:
    # interior: pub qui 14/01 -> início sex 15/01 -> 15,18,19,20,21 -> qui 21/01
    i = calcular_prazo(date(2027, 1, 13), 5, "uteis", capital=False)
    assert i["data_limite"] == date(2027, 1, 21)
    # Capital: 20/01 (qua) não conta -> 15,18,19,21,22 -> sex 22/01
    c = calcular_prazo(date(2027, 1, 13), 5, "uteis", capital=True)
    assert c["data_limite"] == date(2027, 1, 22)


# --- Dias úteis restantes ---------------------------------------------------
def test_dias_uteis_restantes():
    # de quarta 04/03 até sexta 06/03/2026 = 3 dias úteis (conta hoje)
    assert dias_uteis_ate(date(2026, 3, 6), date(2026, 3, 4)) == 3
    assert dias_uteis_ate(date(2026, 3, 4), date(2026, 3, 4)) == 1
    # vencido
    assert dias_uteis_ate(date(2026, 3, 2), date(2026, 3, 4)) < 0


if __name__ == "__main__":
    falhas = 0
    for nome, fn in sorted(globals().items()):
        if nome.startswith("test_") and callable(fn):
            try:
                fn()
                print(f"  ok   {nome}")
            except AssertionError as exc:
                falhas += 1
                print(f"  FALHA {nome}: {exc}")
    print(f"\n{falhas} falha(s).")
    sys.exit(1 if falhas else 0)
