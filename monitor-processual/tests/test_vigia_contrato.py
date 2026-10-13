"""
Testes da ponte monitor -> painel Vigia Processual (core/vigia_contrato.py).

Só números SINTÉTICOS: o repositório é público e nenhum processo real entra
aqui. O dígito verificador é calculado no próprio teste (Res. CNJ 65/2008),
sem usar o código testado.
"""
import os
import sys
from datetime import date, datetime

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import pytest  # noqa: E402

from core import vigia_contrato as v  # noqa: E402


def _numero(seq: int, ano=2020, j="8", tr="19", orig="0001") -> str:
    """Número CNJ válido gerado de forma independente: DD = 98 - (N AAAA J TR OOOO 00) mod 97."""
    n = f"{seq:07d}"
    dd = 98 - int(n + f"{ano}" + j + tr + orig + "00") % 97
    return f"{n}-{dd:02d}.{ano}.{j}.{tr}.{orig}"


AGORA = datetime(2026, 10, 13, 12, 0, 0)


def test_numero_sintetico_gerado_pelo_teste_e_aceito():
    for seq in (1, 1234567, 9999999):
        assert v.dv_valido(_numero(seq)), seq


def test_normalizar_aceita_formatado_e_so_digitos():
    n = _numero(1234567)
    assert v.normalizar_numero(n) == n
    assert v.normalizar_numero(n.replace("-", "").replace(".", "")) == n
    assert v.normalizar_numero(f"  {n}  ") == n


def test_normalizar_rejeita_dv_errado_tamanho_errado_e_lixo():
    n = _numero(1234567)
    errado = n[:8] + ("00" if n[8:10] != "00" else "01") + n[10:]
    for ruim in (errado, "123", "", None, "sem número", n + "9", n[:-1]):
        assert v.normalizar_numero(ruim) is None, ruim


def test_id_e_estavel_e_derivado_do_numero():
    n = _numero(1234567)
    assert v.id_documento(n) == "cnj_" + n.replace("-", "").replace(".", "")
    assert v.id_documento(n) == v.id_documento(n.replace("-", "").replace(".", ""))
    with pytest.raises(ValueError):
        v.id_documento("0000000-00.0000.0.00.0000")


def test_tribunal_curto_igual_ao_do_painel():
    assert v.tribunal_curto(_numero(1, j="5", tr="01")) == "TRT1"
    assert v.tribunal_curto(_numero(1, j="8", tr="26")) == "TJSP"
    assert v.tribunal_curto(_numero(1, j="8", tr="19")) == "TJRJ"
    assert v.tribunal_curto(_numero(1, j="4", tr="02")) == "—"
    assert v.tribunal_curto("lixo") == "—"


def test_montar_documento_preenche_padroes_e_nao_altera_a_entrada():
    proc = {"numero": _numero(10).replace("-", "").replace(".", ""), "tribunal": "TJRJ — 1ª Vara"}
    copia = dict(proc)
    d = v.montar_documento(proc, agora=AGORA)
    assert proc == copia
    assert d["numero"] == _numero(10)
    assert d["id"] == v.id_documento(_numero(10))
    assert d["tribunal"] == "TJRJ — 1ª Vara"
    assert (d["autor"], d["reu"], d["tipo"], d["origem"]) == ("—", "—", "Outro", "Automático")
    assert d["urgente"] is False and d["dadosParciais"] is True and d["ajeap"] is None
    assert d["sincronizadoEm"] == "2026-10-13T12:00:00"
    assert v.auditar([d], agora=AGORA) == [
        {"id": d["id"], "tipo": "datajud_ausente", "detalhe": "nunca verificado no DataJud"}
    ]


def test_montar_documento_usa_mapa_remove_version_e_corrige_origem():
    proc = {"cnj": _numero(11), "version": 3, "origem": "Telepatia", "reu": "Fulano"}
    d = v.montar_documento(proc, mapa={"cnj": "numero"}, agora=AGORA)
    assert d["numero"] == _numero(11)
    assert "version" not in d and "cnj" not in d
    assert d["origem"] == "Automático" and d["reu"] == "Fulano"


def test_montar_documento_recusa_numero_invalido():
    with pytest.raises(ValueError):
        v.montar_documento({"numero": "123"})


def test_montar_prazo_usa_calendario_do_tjrj():
    # qui 02/04/2026 é Quinta-feira Santa: disponibilização nesse dia -> pub seg 06/04 -> início ter 07/04
    p = v.montar_prazo(date(2026, 4, 2), 5, "uteis", agora=AGORA)
    assert (p["dataPublicacao"], p["dataInicio"], p["dataLimite"]) == ("2026-04-06", "2026-04-07", "2026-04-13")
    assert p["tipoContagem"] == "uteis" and p["capital"] is False and p["avisos"] == []
    assert p["calculadoEm"] == "2026-10-13T12:00:00"
    assert p["calendario"].startswith("TJRJ (informativo de ")


def test_montar_prazo_capital_muda_o_resultado_e_traz_aviso():
    p_int = v.montar_prazo(date(2026, 9, 3), 5, capital=False, agora=AGORA)
    p_cap = v.montar_prazo(date(2026, 9, 3), 5, capital=True, agora=AGORA)
    assert p_int["dataLimite"] == "2026-09-14"
    assert p_cap["dataLimite"] == "2026-09-16"
    assert p_cap["capital"] is True and any("04/09/2026" in a for a in p_cap["avisos"])


def test_documento_com_prazo_embutido():
    p = v.montar_prazo(date(2026, 3, 6), 5, agora=AGORA)
    d = v.montar_documento({"numero": _numero(12)}, prazo=p, agora=AGORA)
    assert d["prazo"]["dataLimite"] == "2026-03-16"


def _doc(seq, **extra):
    base = v.montar_documento({"numero": _numero(seq), **extra}, agora=AGORA)
    return base


def test_deduplicar_mantem_o_mais_completo_e_descarta_as_cascas():
    completo = _doc(
        20, autor="A", reu="B", tribunal="TRT1", ultimaMovResumo="x",
        ajeap={"resumoCaso": "Análise real do caso."},
        datajud={"ultimaVerificacao": "2026-10-12T08:00:00"}, eventos=[{"data": "01/10", "texto": "t"}],
    )
    casca1 = _doc(20, origem="E-mail", ajeap={"resumoCaso": "Registro duplicado: mesmo número de p1"})
    casca2 = _doc(20, origem="E-mail")
    outro = _doc(21)
    unicos, descartados = v.deduplicar([casca1, completo, outro, casca2])
    assert {d["id"] for d in unicos} == {completo["id"], outro["id"]}
    assert len(descartados) == 2
    assert [d for d in unicos if d["id"] == completo["id"]][0] is completo


def test_deduplicar_e_deterministico_no_empate():
    a = _doc(30)
    b = dict(_doc(30), id="p_antigo", sincronizadoEm="2026-01-01T00:00:00")
    u1, _ = v.deduplicar([a, b])
    u2, _ = v.deduplicar([b, a])
    assert u1 == u2 and len(u1) == 1


def test_deduplicar_nao_mistura_numeros_invalidos():
    ruim1, ruim2 = {"id": "x1", "numero": "???"}, {"id": "x2", "numero": "???"}
    unicos, descartados = v.deduplicar([ruim1, ruim2])
    assert len(unicos) == 2 and descartados == []


def test_auditar_acusa_cada_problema():
    ok = dict(_doc(40), datajud={"ultimaVerificacao": "2026-10-12T08:00:00", "fonte": "x", "ultimoAndamento": "2026-10-01"})
    velho = dict(_doc(41), datajud={"ultimaVerificacao": "2026-09-23T18:37:21"})
    dup1 = dict(_doc(42), id="p_1", datajud=ok["datajud"])
    dup2 = dict(_doc(42), id="p_2", datajud=ok["datajud"], version=2)
    invalido = {"id": "p_9", "numero": "123"}
    faltando = dict(ok, id=v.id_documento(_numero(43)), numero=_numero(43))
    faltando.pop("reu")
    tipos = {(p["id"], p["tipo"]) for p in v.auditar([ok, velho, dup1, dup2, invalido, faltando], agora=AGORA)}
    assert (velho["id"], "datajud_desatualizado") in tipos
    assert ("p_2", "duplicado") in tipos and ("p_1", "id_fora_do_padrao") in tipos
    assert ("p_2", "campo_reservado") in tipos
    assert ("p_9", "numero_invalido") in tipos
    assert (faltando["id"], "campo_ausente") in tipos
    assert not [t for t in tipos if t[0] == ok["id"]]  # o saudável não gera nada


def test_auditar_colecao_saudavel_retorna_vazio():
    dj = {"ultimaVerificacao": "2026-10-12T08:00:00"}
    docs = [dict(_doc(n), datajud=dj) for n in (50, 51, 52)]
    assert v.auditar(docs, agora=AGORA) == []


def test_auditar_datajud_limite_configuravel():
    d = dict(_doc(60), datajud={"ultimaVerificacao": "2026-10-06T12:00:00"})  # 7 dias
    assert v.auditar([d], agora=AGORA) == []
    assert [p["tipo"] for p in v.auditar([d], agora=AGORA, max_dias_datajud=3)] == ["datajud_desatualizado"]
