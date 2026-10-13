"""Gatilho diário (core/gatilho_diario.py): lógica de execução e servidor local. Sem rede externa."""
import http.client
import json
import os
import sys
import threading
from datetime import date, datetime

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import pytest  # noqa: E402

from core import gatilho_diario as g  # noqa: E402


class Relogio:
    def __init__(self):
        self.dia = date(2026, 10, 14)

    def hoje(self):
        return self.dia

    def agora(self):
        return datetime(self.dia.year, self.dia.month, self.dia.day, 9, 0, 0)


def _gatilho(tmp_path, etapas, relogio=None):
    r = relogio or Relogio()
    return g.Gatilho(etapas, tmp_path / "status.json", hoje=r.hoje, agora=r.agora), r


def _ok(chamadas, nome):
    def f():
        chamadas.append(nome)
        return f"{nome} feito"
    return f


def test_executa_todas_as_etapas_em_ordem(tmp_path):
    ch = []
    gat, _ = _gatilho(tmp_path, [g.Etapa("a", "A", _ok(ch, "a")), g.Etapa("b", "B", _ok(ch, "b"), True)])
    assert gat.iniciar() == "iniciado"
    gat.aguardar()
    assert ch == ["a", "b"] and gat.estado.estado == "concluido"
    assert [e["resultado"] for e in gat.estado.etapas] == ["ok", "ok"]
    assert json.loads((tmp_path / "status.json").read_text(encoding="utf-8"))["estado"] == "concluido"


def test_so_uma_vez_por_dia_e_forcar_reexecuta(tmp_path):
    ch = []
    gat, rel = _gatilho(tmp_path, [g.Etapa("a", "A", _ok(ch, "a"), True)])
    gat.iniciar(); gat.aguardar()
    assert gat.iniciar() == "ja_executado" and ch == ["a"]
    assert gat.iniciar(forcar=True) == "iniciado"; gat.aguardar()
    assert ch == ["a", "a"]
    rel.dia = date(2026, 10, 15)                       # novo dia
    assert gat.iniciar() == "iniciado"; gat.aguardar()
    assert ch == ["a", "a", "a"]


def test_etapa_nao_critica_falha_vira_avisos_e_segue(tmp_path):
    ch = []

    def quebra():
        raise RuntimeError("falha de rede")
    gat, _ = _gatilho(tmp_path, [g.Etapa("a", "A", quebra, False), g.Etapa("b", "B", _ok(ch, "b"), True)])
    gat.iniciar(); gat.aguardar()
    assert gat.estado.estado == "avisos" and ch == ["b"]
    assert gat.estado.etapas[0]["resultado"] == "falhou" and "falha de rede" in gat.estado.etapas[0]["mensagem"]
    assert gat.ja_executou_hoje()                       # avisos contam como feito hoje


def test_etapa_critica_falha_para_o_resto_e_permite_nova_tentativa(tmp_path):
    ch = []

    def quebra():
        raise RuntimeError("sem permissão")
    gat, _ = _gatilho(tmp_path, [g.Etapa("a", "A", quebra, True), g.Etapa("b", "B", _ok(ch, "b"), True)])
    gat.iniciar(); gat.aguardar()
    assert gat.estado.estado == "falhou" and ch == []
    assert gat.estado.etapas[1]["resultado"] == "pulado"
    assert not gat.ja_executou_hoje() and gat.iniciar() == "iniciado"    # falha não trava o dia
    gat.aguardar()


def test_pular_se_marca_pulado(tmp_path):
    ch = []
    gat, _ = _gatilho(tmp_path, [g.Etapa("a", "A", _ok(ch, "a"), False, lambda: "já rodou hoje")])
    gat.iniciar(); gat.aguardar()
    assert ch == [] and gat.estado.etapas[0]["resultado"] == "pulado" and gat.estado.estado == "concluido"


def test_nao_roda_em_paralelo(tmp_path):
    solta, entrou = threading.Event(), threading.Event()

    def lenta():
        entrou.set()
        solta.wait(5)
        return "ok"
    gat, _ = _gatilho(tmp_path, [g.Etapa("a", "A", lenta, True)])
    assert gat.iniciar() == "iniciado"
    assert entrou.wait(5)
    assert gat.iniciar() == "em_andamento" and gat.iniciar(forcar=True) == "em_andamento"
    assert gat.status()["executando"] is True
    solta.set(); gat.aguardar()
    assert gat.estado.estado == "concluido"


def test_estado_executando_de_processo_morto_vira_falhou(tmp_path):
    (tmp_path / "status.json").write_text(json.dumps({"estado": "executando", "data": "2026-10-14", "etapas": []}), encoding="utf-8")
    gat, _ = _gatilho(tmp_path, [])
    assert gat.estado.estado == "falhou" and not gat.ja_executou_hoje()


def test_estado_corrompido_nao_quebra(tmp_path):
    (tmp_path / "status.json").write_text("{ nada", encoding="utf-8")
    gat, _ = _gatilho(tmp_path, [])
    assert gat.estado.estado == "ocioso"


# ------------------------------------------------------------------ HTTP
@pytest.fixture
def servidor(tmp_path):
    ch = []
    gat, _ = _gatilho(tmp_path, [g.Etapa("a", "A", _ok(ch, "a"), True)])
    srv = g.criar_servidor(gat, 0)
    porta = srv.server_address[1]
    t = threading.Thread(target=srv.serve_forever, daemon=True)
    t.start()
    yield gat, porta, ch
    srv.shutdown(); srv.server_close()


def _req(porta, metodo, caminho, host=None, headers=None, corpo=None):
    c = http.client.HTTPConnection("127.0.0.1", porta, timeout=5)
    h = dict(headers or {})
    if host:
        h["Host"] = host
    c.request(metodo, caminho, body=corpo, headers=h)
    r = c.getresponse()
    return r.status, r.read(), dict(r.getheaders())


def test_escuta_so_em_loopback(servidor):
    gat, porta, _ = servidor
    assert gat is not None
    srv = g.criar_servidor(gat, 0)
    try:
        assert srv.server_address[0] == "127.0.0.1"
    finally:
        srv.server_close()


def test_pagina_e_status(servidor):
    _, porta, _ = servidor
    st, corpo, cab = _req(porta, "GET", "/")
    assert st == 200 and b"Vigia Processual" in corpo and "text/html" in cab["Content-Type"]
    assert b"Content-Security-Policy" not in corpo and "default-src 'self'" in cab["Content-Security-Policy"]
    st, corpo, _ = _req(porta, "GET", "/status")
    assert st == 200 and json.loads(corpo)["estado"] == "ocioso"
    assert _req(porta, "GET", "/outra-coisa")[0] == 404


def test_host_estranho_e_recusado_dns_rebinding(servidor):
    _, porta, _ = servidor
    assert _req(porta, "GET", "/status", host="evil.example.com")[0] == 403
    assert _req(porta, "POST", "/executar", host="evil.example.com", headers={"X-Vigia": "1"})[0] == 403
    assert _req(porta, "GET", "/status", host=f"localhost:{porta}")[0] == 200


def test_post_sem_cabecalho_e_recusado(servidor):
    gat, porta, ch = servidor
    assert _req(porta, "POST", "/executar", corpo=b"{}")[0] == 403
    assert ch == [] and gat.estado.estado == "ocioso"


def test_post_dispara_uma_vez_e_forcar_dispara_de_novo(servidor):
    gat, porta, ch = servidor
    st, corpo, _ = _req(porta, "POST", "/executar", headers={"X-Vigia": "1"}, corpo=b'{"forcar": false}')
    assert st == 200 and json.loads(corpo)["resultado"] == "iniciado"
    gat.aguardar()
    assert json.loads(_req(porta, "POST", "/executar", headers={"X-Vigia": "1"}, corpo=b"{}")[1])["resultado"] == "ja_executado"
    assert json.loads(_req(porta, "POST", "/executar", headers={"X-Vigia": "1"}, corpo=b'{"forcar": true}')[1])["resultado"] == "iniciado"
    gat.aguardar()
    assert ch == ["a", "a"]


def test_corpo_invalido_nao_derruba(servidor):
    gat, porta, _ = servidor
    st, corpo, _ = _req(porta, "POST", "/executar", headers={"X-Vigia": "1"}, corpo=b"isso nao e json")
    assert st == 200 and json.loads(corpo)["resultado"] in ("iniciado", "ja_executado")
    gat.aguardar()


def test_etapas_reais_exportar_e_publicar(tmp_path):
    """Montagem real: sem Drive, publicar é pulada; com Drive, copia o retrato. Banco sintético."""
    import sqlite3
    base = tmp_path / "monitor"
    (base / "data").mkdir(parents=True)
    con = sqlite3.connect(base / "data" / "monitor.db")
    con.executescript("""
    CREATE TABLE comunicacoes (id TEXT PRIMARY KEY, numero_processo TEXT, sigla_tribunal TEXT, data_disponibilizacao TEXT, texto TEXT, tipo TEXT, precisa_peticao INTEGER, revisao_manual INTEGER, motivo_revisao TEXT, cancelada INTEGER DEFAULT 0, origem_oab TEXT, origem_nome TEXT, criado_em TEXT, atualizado_em TEXT);
    CREATE TABLE execucoes (id INTEGER PRIMARY KEY AUTOINCREMENT, executado_em TEXT, novas_comunicacoes INTEGER, novas_movimentacoes INTEGER, novos_prazos INTEGER, sucesso INTEGER, janela_inicio TEXT, janela_fim TEXT, erros TEXT);
    CREATE TABLE movimentacoes (id INTEGER PRIMARY KEY AUTOINCREMENT, numero_processo TEXT, data_movimento TEXT, codigo INTEGER, descricao TEXT, criado_em TEXT);
    CREATE TABLE prazos (id INTEGER PRIMARY KEY AUTOINCREMENT, comunicacao_id TEXT, numero_processo TEXT, data_disponibilizacao TEXT, data_publicacao TEXT, data_inicio_prazo TEXT, dias INTEGER, tipo_contagem TEXT, data_limite TEXT, status TEXT DEFAULT 'aberto', observacoes TEXT, criado_em TEXT, concluido_em TEXT);
    CREATE TABLE processos_acompanhados (numero_processo TEXT PRIMARY KEY, apelido TEXT, sigla_tribunal TEXT, observacoes TEXT);
    """)
    con.commit(); con.close()
    drive = tmp_path / "drive"; drive.mkdir()
    etapas = {e.nome: e for e in g.montar_etapas(base, drive=drive, lista=None)}
    assert etapas["importar"].pular_se() is not None                      # sem lista configurada
    assert etapas["coleta"].pular_se() is None                            # nenhuma execução hoje
    assert "0 processo(s)" in etapas["exportar"].executar()
    assert (base / "data" / "retrato_vigia.json").is_file()
    etapas["publicar"].executar()
    assert (drive / "retrato_vigia.json").is_file() and not (drive / "retrato_vigia.json.tmp").exists()
    sem_drive = {e.nome: e for e in g.montar_etapas(base, drive=None, lista=None)}
    assert sem_drive["publicar"].pular_se() is not None
