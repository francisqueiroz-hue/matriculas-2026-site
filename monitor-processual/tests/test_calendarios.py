"""
Testes dos perfis de calendário por tribunal (core/calendarios.py).

O calendário do TRT1 abaixo foi escrito à mão a partir da TABELA do art. 1º do
Ato nº 109/2025 do TRT1 (lida em 13/10/2026), sem usar core.calendario_trt1.
"""
import os
import sys
import threading
from datetime import date, timedelta

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from core import calendario_nacional as nac  # noqa: E402
from core import calendario_trt1 as trt1  # noqa: E402
from core import calendarios  # noqa: E402
from core.calendar_prazos import calcular_prazo, dias_uteis_ate, eh_dia_util  # noqa: E402

# Dias da SEMANA sem expediente no TRT1 em 2026 (tabela do art. 1º do Ato 109/2025).
_TRT1_2026 = {
    date(2026, 1, 1), date(2026, 1, 2), date(2026, 1, 5), date(2026, 1, 6),   # 01/01 e recesso 02 a 06/01
    date(2026, 2, 16), date(2026, 2, 17), date(2026, 2, 18),                  # Carnaval
    date(2026, 4, 1), date(2026, 4, 2), date(2026, 4, 3),                     # Semana Santa
    date(2026, 4, 21), date(2026, 4, 23),                                     # Tiradentes; São Jorge
    date(2026, 5, 1), date(2026, 6, 4),                                       # Trabalho; Corpus Christi
    date(2026, 8, 11),                                                        # Instituição dos Cursos Jurídicos
    date(2026, 9, 7), date(2026, 10, 12), date(2026, 10, 28),                 # Independência; Aparecida; Servidor
    date(2026, 11, 2), date(2026, 11, 20),                                    # Finados; Consciência Negra
    date(2026, 12, 8),                                                        # Dia da Justiça
    *(date(2026, 12, d) for d in (21, 22, 23, 24, 25, 28, 29, 30, 31)),       # recesso 20 a 31/12
}
# janeiro de 2027 (só o recesso, para os varreduras que passam do ano)
_TRT1_2027_JAN = {date(2027, 1, 1), date(2027, 1, 4), date(2027, 1, 5), date(2027, 1, 6)}


def _util_trt1(d):
    return d.weekday() < 5 and d not in _TRT1_2026 and d not in _TRT1_2027_JAN


def _seguinte(d):
    d += timedelta(days=1)
    while not _util_trt1(d):
        d += timedelta(days=1)
    return d


def test_trt1_2026_conjunto_exato():
    obtido = {d for d in trt1.dias_nao_uteis(2026) if d.weekday() < 5}
    assert obtido == _TRT1_2026, (
        f"a mais: {sorted(obtido - _TRT1_2026)} | a menos: {sorted(_TRT1_2026 - obtido)}"
    )


def test_trt1_recesso_vai_ate_06_01_e_dia_07_e_util():
    for d in (date(2027, 1, 1), date(2027, 1, 4), date(2027, 1, 5), date(2027, 1, 6)):
        assert not eh_dia_util(d, tribunal="TRT1"), d
    assert eh_dia_util(date(2027, 1, 7), tribunal="TRT1")
    assert eh_dia_util(date(2027, 1, 20), tribunal="TRT1")  # sem aplicar_recesso


def test_trt1_dia_do_servidor_e_28_10_por_decisao_do_usuario_e_avisa():
    assert not eh_dia_util(date(2026, 10, 28), tribunal="TRT1")
    assert eh_dia_util(date(2026, 10, 30), tribunal="TRT1")
    # ter 27/10, 5 úteis: pub qui 29/10 (28/10 não útil), início sex 30/10;
    # 30/10 (1), 03/11 (2; 02/11 Finados), 04/11 (3), 05/11 (4), 06/11 (5)
    r = calcular_prazo(date(2026, 10, 27), 5, tribunal="TRT1")
    assert (r["data_publicacao"], r["data_inicio_prazo"], r["data_limite"]) == (
        date(2026, 10, 29), date(2026, 10, 30), date(2026, 11, 6))
    assert any("28/10/2026" in a and "30/10" in a for a in r["avisos"])


def test_trt1_quatro_dias_do_art_2_sao_uteis_com_ressalva():
    for dia in (date(2026, 4, 20), date(2026, 6, 5), date(2026, 8, 10), date(2026, 12, 7)):
        assert eh_dia_util(dia, tribunal="TRT1"), dia
    # sex 17/04, 3 úteis: pub seg 20/04 (útil); início qua 22/04 (21 Tiradentes);
    # 23/04 São Jorge; 22 (1), 24 (2), 27 (3) -> seg 27/04, com aviso do art. 2º
    r = calcular_prazo(date(2026, 4, 17), 3, tribunal="TRT1")
    assert (r["data_publicacao"], r["data_inicio_prazo"], r["data_limite"]) == (
        date(2026, 4, 20), date(2026, 4, 22), date(2026, 4, 27))
    assert any("20/04/2026" in a and "Art. 2º" in a for a in r["avisos"])
    # no TJRJ o mesmo prazo vence um dia depois (24/04 é ponto facultativo lá)
    assert calcular_prazo(date(2026, 4, 17), 3, tribunal="TJRJ")["data_limite"] == date(2026, 4, 28)


def test_trt1_semana_santa_inclui_a_quarta_e_o_tjrj_nao():
    # seg 30/03: TRT1 -> pub ter 31/03, início seg 06/04 (01 a 03/04 sem expediente)
    t = calcular_prazo(date(2026, 3, 30), 3, tribunal="TRT1")
    assert (t["data_publicacao"], t["data_inicio_prazo"], t["data_limite"]) == (
        date(2026, 3, 31), date(2026, 4, 6), date(2026, 4, 8))
    j = calcular_prazo(date(2026, 3, 30), 3, tribunal="TJRJ")
    assert (j["data_inicio_prazo"], j["data_limite"]) == (date(2026, 4, 1), date(2026, 4, 7))


def test_dias_em_que_trt1_e_tjrj_divergem():
    so_tjrj = [date(2026, 2, 13), date(2026, 2, 27), date(2026, 4, 24), date(2026, 6, 5), date(2026, 6, 29)]
    for d in so_tjrj:  # atos do TJRJ que o TRT1 não tem
        assert not eh_dia_util(d, tribunal="TJRJ") and eh_dia_util(d, tribunal="TRT1"), d
    so_trt1 = [date(2026, 4, 1), date(2026, 10, 28), date(2026, 12, 21), date(2026, 1, 2)]
    for d in so_trt1:  # feriados do TRT1 que o TJRJ (sem aplicar recesso) trata como úteis
        assert eh_dia_util(d, tribunal="TJRJ") and not eh_dia_util(d, tribunal="TRT1"), d
    ambos = [date(2026, 4, 2), date(2026, 4, 3), date(2026, 4, 23), date(2026, 8, 11), date(2026, 12, 8), date(2026, 2, 18)]
    for d in ambos:
        assert not eh_dia_util(d, tribunal="TJRJ") and not eh_dia_util(d, tribunal="TRT1"), d


def test_trt1_capital_acrescenta_so_o_20_de_janeiro():
    assert calendarios.PERFIS["TRT1"].dias_nao_uteis_capital(2027) == {
        date(2027, 1, 20): "São Sebastião (município do Rio de Janeiro)"}
    # qua 13/01/2027, 5 úteis: interior -> início sex 15/01 -> 15,18,19,20,21 -> qui 21/01
    assert calcular_prazo(date(2027, 1, 13), 5, tribunal="TRT1", capital=False)["data_limite"] == date(2027, 1, 21)
    # Capital: 20/01 não conta -> 15,18,19,21,22 -> sex 22/01
    assert calcular_prazo(date(2027, 1, 13), 5, tribunal="TRT1", capital=True)["data_limite"] == date(2027, 1, 22)


def test_trt1_ano_sem_ato_avisa():
    r = calcular_prazo(date(2027, 3, 1), 5, tribunal="TRT1")
    assert any("TRT1" in a and "2027" in a and "cadastrados" in a for a in r["avisos"])
    assert not any("cadastrados" in a for a in calcular_prazo(date(2026, 3, 6), 5, tribunal="TRT1")["avisos"])


def test_normalizar_sigla_e_resolver():
    for variante in ("TRT1", "trt1", "TRT-1", "TRT 1", "TRT01", "trt 1ª"):
        assert calendarios.normalizar_sigla(variante) == "TRT1", variante
    assert calendarios.normalizar_sigla(" tjrj ") == "TJRJ"
    assert calendarios.normalizar_sigla("") is None and calendarios.normalizar_sigla(None) is None
    assert calendarios.resolver(None)[0] == "TJRJ" and calendarios.resolver(None)[2] is False
    assert calendarios.resolver("TRT1")[0] == "TRT1" and calendarios.resolver("TRT1")[2] is False
    assert calendarios.resolver("TRT2") == ("TRT2", nac, True)
    assert calendarios.resolver("TRF2") == ("TRF2", nac, True)


def test_tribunal_sem_perfil_usa_nacional_e_avisa():
    r = calcular_prazo(date(2026, 4, 2), 5, tribunal="TRF2")
    assert r["calendario"] == "TRF2" and r["calendario_reserva"] is True
    assert "NÃO cadastrado" in r["avisos"][0]
    # nacional: Quinta Santa é útil; Sexta Santa não. qui 02/04 -> pub seg 06/04 -> início ter 07/04
    assert (r["data_publicacao"], r["data_inicio_prazo"]) == (date(2026, 4, 6), date(2026, 4, 7))
    assert eh_dia_util(date(2026, 4, 2), tribunal="TRF2") and not eh_dia_util(date(2026, 4, 3), tribunal="TRF2")
    assert eh_dia_util(date(2026, 4, 23), tribunal="TRF2")        # São Jorge não é nacional
    assert not eh_dia_util(date(2026, 11, 20), tribunal="TRF2")   # Consciência Negra é nacional desde 2024


def test_sem_tribunal_equivale_ao_tjrj():
    a = calcular_prazo(date(2026, 4, 17), 3)
    b = calcular_prazo(date(2026, 4, 17), 3, tribunal="TJRJ")
    assert {k: a[k] for k in ("data_publicacao", "data_inicio_prazo", "data_limite", "avisos")} == \
           {k: b[k] for k in ("data_publicacao", "data_inicio_prazo", "data_limite", "avisos")}
    assert a["calendario"] == "TJRJ" and a["calendario_reserva"] is False


def test_perfil_nao_vaza_para_chamadas_seguintes():
    calcular_prazo(date(2026, 3, 30), 3, tribunal="TRT1")
    assert eh_dia_util(date(2026, 4, 1))                       # padrão TJRJ: quarta é útil
    assert not eh_dia_util(date(2026, 4, 1), tribunal="TRT1")
    assert eh_dia_util(date(2026, 4, 1))                       # e continua útil depois


def test_perfis_em_threads_nao_se_misturam():
    erros, barreira = [], threading.Barrier(8)

    def trabalho(i):
        trib = "TRT1" if i % 2 else "TJRJ"
        esperado = date(2026, 4, 8) if trib == "TRT1" else date(2026, 4, 7)
        barreira.wait()
        for _ in range(200):
            if calcular_prazo(date(2026, 3, 30), 3, tribunal=trib)["data_limite"] != esperado:
                erros.append((i, trib))
                return

    ts = [threading.Thread(target=trabalho, args=(i,)) for i in range(8)]
    [t.start() for t in ts]
    [t.join() for t in ts]
    assert erros == []


def test_dias_uteis_ate_respeita_o_tribunal():
    # de qua 01/04 até seg 06/04/2026: TJRJ conta 01/04 e 06/04 (2); TRT1 só 06/04 (1)
    assert dias_uteis_ate(date(2026, 4, 6), date(2026, 4, 1), tribunal="TJRJ") == 2
    assert dias_uteis_ate(date(2026, 4, 6), date(2026, 4, 1), tribunal="TRT1") == 1


def test_varredura_trt1_contra_oraculo_independente():
    d = date(2026, 1, 1)
    while d <= date(2026, 11, 30):
        pub = _seguinte(d)
        ini = _seguinte(pub)
        for n in (1, 5, 15):
            r = calcular_prazo(d, n, tribunal="TRT1")
            assert (r["data_publicacao"], r["data_inicio_prazo"]) == (pub, ini), d
            lim, c, cont = r["data_limite"], ini, 0
            assert _util_trt1(lim), f"{lim} não é útil (disp {d}, n={n})"
            while c <= lim:
                cont += _util_trt1(c)
                c += timedelta(days=1)
            assert cont == n, f"disp {d}, n={n}: contou {cont}"
        d += timedelta(days=1)


def test_nacional_conjunto_2026():
    esperado = {
        date(2026, 1, 1), date(2026, 2, 16), date(2026, 2, 17), date(2026, 4, 3), date(2026, 4, 21),
        date(2026, 5, 1), date(2026, 6, 4), date(2026, 9, 7), date(2026, 10, 12), date(2026, 11, 2),
        date(2026, 11, 20), date(2026, 12, 25),
    }
    assert {d for d in nac.dias_nao_uteis(2026) if d.weekday() < 5} == esperado
