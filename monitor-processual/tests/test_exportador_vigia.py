"""Exportador monitor -> retrato (core/exportador_vigia.py). Só dados SINTÉTICOS."""
import json
import os
import sqlite3
import sys
from datetime import date, datetime

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import pytest  # noqa: E402

from core import exportador_vigia as ex  # noqa: E402
from core import vigia_analise as va  # noqa: E402
from core import vigia_contrato as vc  # noqa: E402

AGORA = datetime(2026, 10, 14, 8, 0, 0)

ESQUEMA = """
CREATE TABLE comunicacoes (id TEXT PRIMARY KEY, numero_processo TEXT, sigla_tribunal TEXT,
  data_disponibilizacao TEXT, texto TEXT, tipo TEXT, precisa_peticao INTEGER DEFAULT 0,
  revisao_manual INTEGER DEFAULT 0, motivo_revisao TEXT, cancelada INTEGER DEFAULT 0,
  origem_oab TEXT, origem_nome TEXT, criado_em TEXT, atualizado_em TEXT);
CREATE TABLE execucoes (id INTEGER PRIMARY KEY AUTOINCREMENT, executado_em TEXT, novas_comunicacoes INTEGER,
  novas_movimentacoes INTEGER, novos_prazos INTEGER, sucesso INTEGER, janela_inicio TEXT, janela_fim TEXT, erros TEXT);
CREATE TABLE movimentacoes (id INTEGER PRIMARY KEY AUTOINCREMENT, numero_processo TEXT, data_movimento TEXT,
  codigo INTEGER, descricao TEXT, criado_em TEXT);
CREATE TABLE prazos (id INTEGER PRIMARY KEY AUTOINCREMENT, comunicacao_id TEXT UNIQUE, numero_processo TEXT,
  data_disponibilizacao TEXT, data_publicacao TEXT, data_inicio_prazo TEXT, dias INTEGER, tipo_contagem TEXT,
  data_limite TEXT, status TEXT DEFAULT 'aberto', observacoes TEXT, criado_em TEXT, concluido_em TEXT);
CREATE TABLE processos_acompanhados (numero_processo TEXT PRIMARY KEY, apelido TEXT, sigla_tribunal TEXT, observacoes TEXT);
"""


def _numero(seq, j="8", tr="19"):
    n = f"{seq:07d}"
    dd = 98 - int(n + "2020" + j + tr + "0001" + "00") % 97
    return f"{n}-{dd:02d}.2020.{j}.{tr}.0001"


@pytest.fixture
def db(tmp_path):
    p = tmp_path / "monitor.db"
    con = sqlite3.connect(p)
    con.executescript(ESQUEMA)
    con.commit()
    con.close()
    return p


def _sql(db, sql, *args):
    con = sqlite3.connect(db)
    con.execute(sql, args)
    con.commit()
    con.close()


def _acomp(db, n, apelido=None, sigla="TJRJ"):
    _sql(db, "insert into processos_acompanhados values (?,?,?,?)", n, apelido, sigla, None)


def _com(db, cid, n, disp, texto, criado, cancelada=0):
    _sql(db, "insert into comunicacoes (id,numero_processo,sigla_tribunal,data_disponibilizacao,texto,cancelada,criado_em)"
             " values (?,?,?,?,?,?,?)", cid, n, "TJRJ", disp, texto, cancelada, criado)


def _prazo(db, cid, n, disp, dias, tipo, limite, status="aberto", pub=None):
    _sql(db, "insert into prazos (comunicacao_id,numero_processo,data_disponibilizacao,data_publicacao,dias,"
             "tipo_contagem,data_limite,status) values (?,?,?,?,?,?,?,?)", cid, n, disp, pub, dias, tipo, limite, status)


def test_banco_vazio_gera_retrato_vazio(db):
    r = ex.exportar(db, agora=AGORA)
    assert r["processos"] == [] and r["auditoria"] == []


def test_arquivo_inexistente_levanta(tmp_path):
    with pytest.raises(FileNotFoundError):
        ex.exportar(tmp_path / "nao_existe.db", agora=AGORA)


def test_nao_escreve_no_banco(db):
    _acomp(db, _numero(1), "Caso A")
    antes = db.read_bytes()
    ex.exportar(db, agora=AGORA)
    assert db.read_bytes() == antes
    con = ex._abrir_somente_leitura(db)
    with pytest.raises(sqlite3.OperationalError):
        con.execute("insert into execucoes (executado_em) values ('x')")
    con.close()


def test_documento_valido_com_prazo_recalculado(db):
    n = _numero(2)
    _acomp(db, n, "Caso B")
    _com(db, "c1", n, "2026-03-06", "Intimação para manifestação em 5 dias", "2026-10-14 06:00:00")
    # sex 06/03/2026, 5 úteis (TJRJ): pub seg 09/03, início ter 10/03 -> limite seg 16/03 (ver test_vigia_contrato)
    _prazo(db, "c1", n, "2026-03-06", 5, "uteis", "2026-03-16", pub="2026-03-09")
    r = ex.exportar(db, agora=AGORA)
    assert r["auditoria"] == []
    p = r["processos"][0]
    d = p["documento"]
    assert d["id"] == vc.id_documento(n) and d["nomeLocal"] == "Caso B" and d["tribunal"] == "TJRJ"
    assert d["prazo"]["dataLimite"] == "2026-03-16"
    assert p["retrato"]["prazos_abertos"] == [{"data_limite": "2026-03-16", "data_publicacao": "2026-03-09"}]
    assert "version" not in d


def test_prazo_divergente_do_calculo_vai_para_auditoria(db):
    n = _numero(3)
    _acomp(db, n)
    _com(db, "c2", n, "2026-03-06", "x", "2026-03-06 10:00:00")
    _prazo(db, "c2", n, "2026-03-06", 5, "uteis", "2026-03-13")  # errado de propósito
    r = ex.exportar(db, agora=AGORA)
    assert [a["tipo"] for a in r["auditoria"]] == ["prazo_divergente"]
    assert r["processos"][0]["documento"]["prazo"]["dataLimite"] == "2026-03-16"  # vale o cálculo, não o banco


def test_prazo_de_evento_sem_data_limite_nao_vira_prazo(db):
    n = _numero(4)
    _acomp(db, n)
    _prazo(db, "c3", n, None, None, "evento", None)
    r = ex.exportar(db, agora=AGORA)
    assert [a["tipo"] for a in r["auditoria"]] == ["prazo_sem_data_limite"]
    assert "prazo" not in r["processos"][0]["documento"]
    assert r["processos"][0]["retrato"]["prazos_abertos"] == []


def test_prazo_concluido_e_ignorado(db):
    n = _numero(5)
    _acomp(db, n)
    _prazo(db, "c4", n, "2026-03-06", 5, "uteis", "2026-03-16", status="concluido")
    assert ex.exportar(db, agora=AGORA)["processos"][0]["retrato"]["prazos_abertos"] == []


def test_novidade_so_dentro_da_janela_e_termos_sensiveis(db):
    a, b = _numero(6), _numero(7)
    _acomp(db, a)
    _acomp(db, b)
    _com(db, "n1", a, "2026-10-13", "Decurso de prazo certificado. CITAÇÃO expedida.", "2026-10-14 06:30:00")
    _com(db, "n2", b, "2026-10-01", "Intimação antiga", "2026-10-01 06:30:00")
    r = {p["documento"]["numero"]: p["retrato"] for p in ex.exportar(db, agora=AGORA)["processos"]}
    assert r[a]["novidade"] is True and set(r[a]["termos_sensiveis"]) == {"decurso de prazo", "citacao"}
    assert r[b]["novidade"] is False and r[b]["termos_sensiveis"] == []


def test_comunicacao_cancelada_nao_conta_e_texto_e_truncado(db):
    n = _numero(8)
    _acomp(db, n)
    _com(db, "x1", n, "2026-10-13", "cancelada", "2026-10-14 06:30:00", cancelada=1)
    _com(db, "x2", n, "2026-10-12", "A" * 5000, "2026-10-12 06:30:00")
    p = ex.exportar(db, agora=AGORA)["processos"][0]
    assert p["retrato"]["novidade"] is False
    assert len(p["comunicacoes"]) == 1 and len(p["comunicacoes"][0]["texto"]) == ex.MAX_TEXTO


def test_movimentacoes_alimentam_ultima_mov_e_eventos(db):
    n = _numero(9)
    _acomp(db, n)
    for data, cod, desc, criado in (("2026-09-01T10:00:00", 1, "Juntada de petição", "2026-09-02 06:00:00"),
                                    ("2026-10-05T10:00:00", 2, "Conclusos para sentença", "2026-10-06 06:00:00")):
        _sql(db, "insert into movimentacoes (numero_processo,data_movimento,codigo,descricao,criado_em) values (?,?,?,?,?)",
             n, data, cod, desc, criado)
    p = ex.exportar(db, agora=AGORA)["processos"][0]
    assert p["documento"]["ultimaMovData"] == "2026-10-05"
    assert p["documento"]["ultimaMovResumo"] == "Conclusos para sentença"
    assert p["documento"]["eventos"][0] == {"data": "05/10/2026", "texto": "Conclusos para sentença"}
    assert p["retrato"]["ultimo_andamento_data"] == "2026-10-05"


def test_numero_invalido_e_duplicado_vao_para_auditoria_sem_derrubar_o_resto(db):
    ok = _numero(10)
    _acomp(db, "123")
    _acomp(db, ok)
    _acomp(db, ok.replace("-", "").replace(".", ""))
    r = ex.exportar(db, agora=AGORA)
    assert len(r["processos"]) == 1
    assert sorted(a["tipo"] for a in r["auditoria"]) == ["duplicado", "numero_invalido"]


def test_integra_com_a_fila_de_analise(db):
    n = _numero(11)
    _acomp(db, n)
    _com(db, "i1", n, "2026-10-09", "Intimação", "2026-10-14 06:00:00")
    # sex 09/10/2026, 5 úteis: 12/10 (Aparecida) não é útil -> pub ter 13/10, início qua 14/10 -> vence ter 20/10
    _prazo(db, "i1", n, "2026-10-09", 5, "uteis", "2026-10-20")
    p = ex.exportar(db, agora=AGORA)["processos"][0]
    lim = p["documento"]["prazo"]["dataLimite"]
    motivos = va.motivos_para_analisar(p["documento"], p["retrato"], hoje=date(2026, 10, 14))
    assert "sem_ajeap" in motivos and "novidade_no_retrato" in motivos
    assert lim == "2026-10-20" == p["retrato"]["prazos_abertos"][0]["data_limite"]
    pacote = va.montar_pacote_analise(p["documento"], p["retrato"], p["comunicacoes"], motivos=motivos)
    assert pacote["intimacoes"][0]["texto"] == "Intimação"


def test_gravar_e_atomico_e_cli(db, tmp_path, capsys):
    n = _numero(12)
    _acomp(db, n)
    saida = tmp_path / "sub" / "retrato.json"
    assert ex.main(["--db", str(db), "--saida", str(saida)]) == 0
    dados = json.loads(saida.read_text(encoding="utf-8"))
    assert len(dados["processos"]) == 1 and not (tmp_path / "sub" / "retrato.json.tmp").exists()
    assert n not in capsys.readouterr().out  # stdout nunca imprime número de processo


def test_retrato_usa_o_prazo_recalculado_quando_o_banco_diverge(db):
    n = _numero(13)
    _acomp(db, n)
    _com(db, "d1", n, "2026-03-06", "x", "2026-03-06 10:00:00")
    _prazo(db, "d1", n, "2026-03-06", 5, "uteis", "2026-03-13")  # errado de propósito
    p = ex.exportar(db, agora=AGORA)["processos"][0]
    assert p["documento"]["prazo"]["dataLimite"] == p["retrato"]["prazos_abertos"][0]["data_limite"] == "2026-03-16"


def test_capital_configurada_muda_o_prazo_e_o_aviso(db):
    n = _numero(14)
    _acomp(db, n)
    # qui 21/01/2027, 1 dia útil (TJSP): interior vence seg 25/01; capital (25/01 feriado) vence ter 26/01
    _com(db, "k1", n, "2027-01-21", "x", "2027-01-21 10:00:00")
    _prazo(db, "k1", n, "2027-01-21", 1, "uteis", "2027-01-25")
    _sql(db, "update comunicacoes set sigla_tribunal='TJSP' where id='k1'")
    interior = ex.exportar(db, agora=AGORA)["processos"][0]["documento"]["prazo"]
    assert interior["dataLimite"] == "2027-01-25" and interior["capital"] is False
    (db.parent / "configuracao_vigia.json").write_text(json.dumps({"capital": [n.replace("-", "").replace(".", "")]}), encoding="utf-8")
    r = ex.exportar(db, agora=AGORA)
    cap = r["processos"][0]["documento"]["prazo"]
    assert cap["dataLimite"] == "2027-01-26" and cap["capital"] is True
    assert r["processos"][0]["retrato"]["prazos_abertos"][0]["data_limite"] == "2027-01-26"
    assert [a["tipo"] for a in r["auditoria"]] == ["prazo_divergente"]   # o banco ainda diz 25/01


def test_configuracao_ausente_ou_corrompida_nao_quebra(db):
    assert ex.ler_capital(db) == set()
    (db.parent / "configuracao_vigia.json").write_text("{ não é json", encoding="utf-8")
    assert ex.ler_capital(db) == set()
    (db.parent / "configuracao_vigia.json").write_text(json.dumps({"capital": "texto", "x": 1}), encoding="utf-8")
    assert ex.ler_capital(db) == set()
