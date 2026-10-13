"""Frescor da fonte DataJud (core/datajud_fonte.py). Sem rede: o cliente é injetado. Só dados sintéticos."""
import json
import os
import sqlite3
import sys
from datetime import datetime

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from core import datajud_fonte as df  # noqa: E402

AGORA = datetime(2026, 10, 14, 9, 0, 0)


def _numero(seq, j="5", tr="01"):
    n = f"{seq:07d}"
    dd = 98 - int(n + "2020" + j + tr + "0001" + "00") % 97
    return f"{n}-{dd:02d}.2020.{j}.{tr}.0001"


def _fonte(atual, movs=(), ):
    return {"dataHoraUltimaAtualizacao": atual, "movimentos": [{"dataHora": m, "codigo": 1, "nome": "x"} for m in movs]}


def test_resumir_pega_o_mais_recente_entre_primeiro_e_segundo_grau():
    r = df.resumir([_fonte("2026-09-13T23:02:50.389Z", ["2026-08-12T12:04:56.000Z"]),
                    _fonte("2026-09-20T10:00:00.000Z", ["2026-09-01T08:00:00.000Z", "2026-07-01T08:00:00.000Z"])])
    assert r == {"atualizadoEm": "2026-09-20T10:00:00", "ultimoMovimento": "2026-09-01T08:00:00"}


def test_resumir_vazio_ou_sem_datas():
    assert df.resumir([]) is None
    assert df.resumir([{}]) is None
    assert df.resumir([{"dataHoraUltimaAtualizacao": "lixo", "movimentos": [{"dataHora": None}]}]) is None
    assert df.resumir([{"dataHoraUltimaAtualizacao": "2026-09-13"}]) == {"atualizadoEm": "2026-09-13", "ultimoMovimento": None}


def test_coletar_usa_digitos_e_registra_verificacao():
    chamadas = []

    def buscar(num, sigla, chave):
        chamadas.append((num, sigla, chave))
        return [_fonte("2026-09-13T23:02:50.389Z", ["2026-08-12T12:04:56.000Z"])]
    n = _numero(1)
    r = df.coletar([(n, "TRT1")], "CHAVE", buscar=buscar, agora=AGORA)
    assert chamadas == [(n.replace("-", "").replace(".", ""), "TRT1", "CHAVE")]
    assert r["processos"][n] == {"atualizadoEm": "2026-09-13T23:02:50", "ultimoMovimento": "2026-08-12T12:04:56",
                                 "verificadoEm": "2026-10-14T09:00:00"}
    assert r["erros"] == [] and r["interrompido"] is False


def test_falha_de_um_processo_nao_derruba_os_outros_e_mantem_o_anterior():
    a, b, c = _numero(1), _numero(2), _numero(3)
    anterior = {"processos": {b: {"atualizadoEm": "2026-09-01T00:00:00", "ultimoMovimento": None, "verificadoEm": "2026-10-01T09:00:00"}}}

    def buscar(num, sigla, chave):
        if num == b.replace("-", "").replace(".", ""):
            raise RuntimeError("DataJud não respondeu")
        if num == c.replace("-", "").replace(".", ""):
            return []
        return [_fonte("2026-09-13T00:00:00Z")]
    r = df.coletar([(a, "TRT1"), (b, "TRT1"), (c, "TRT1")], "K", buscar=buscar, anterior=anterior, agora=AGORA)
    assert a in r["processos"]
    assert r["processos"][b]["verificadoEm"] == "2026-10-01T09:00:00"     # manteve o valor anterior
    assert c not in r["processos"]
    assert sorted(e["tipo"] for e in r["erros"]) == ["RuntimeError", "sem_dados"]
    assert all(n not in json.dumps(r["erros"]) for n in (a, b, c))        # erros não carregam número de processo


def test_http_401_ou_403_interrompe_para_nao_insistir():
    chamadas = []

    def buscar(num, sigla, chave):
        chamadas.append(num)
        raise df_erro("HTTP 401 do DataJud — a chave pública provavelmente mudou.")

    class df_erro(Exception):
        pass
    r = df.coletar([(_numero(i), "TRT1") for i in range(1, 6)], "K", buscar=buscar, agora=AGORA)
    assert len(chamadas) == 1 and r["interrompido"] is True and r["erros"][0]["codigo"] == "HTTP 401"


def test_ler_env_aceita_aspas_comentarios_e_bom(tmp_path):
    p = tmp_path / ".env"
    p.write_bytes("﻿# chave\nDATAJUD_API_KEY=\"abc==\"\nOUTRA = x y\nsem_igual\n".encode("utf-8"))
    assert df.ler_env(p) == {"DATAJUD_API_KEY": "abc==", "OUTRA": "x y"}
    assert df.ler_env(tmp_path / "nao_existe") == {}


def test_gravar_atomico_e_carregar(tmp_path):
    destino = tmp_path / "data" / "datajud_fonte.json"
    df.gravar({"processos": {"x": {"atualizadoEm": "2026-09-13T00:00:00"}}, "erros": []}, destino)
    assert not (tmp_path / "data" / "datajud_fonte.json.tmp").exists()
    assert df.carregar(destino)["processos"]["x"]["atualizadoEm"] == "2026-09-13T00:00:00"
    destino.write_text("{ lixo", encoding="utf-8")
    assert df.carregar(destino) == {}


def _banco(tmp_path, numeros):
    (tmp_path / "data").mkdir()
    p = tmp_path / "data" / "monitor.db"
    con = sqlite3.connect(p)
    con.execute("create table processos_acompanhados (numero_processo text primary key, apelido text, sigla_tribunal text, observacoes text)")
    for n, s in numeros:
        con.execute("insert into processos_acompanhados values (?,?,?,?)", (n, None, s, None))
    con.commit(); con.close()
    return p


def test_listar_processos_valida_e_deduplica_e_deduz_sigla(tmp_path):
    ok = _numero(1)
    db = _banco(tmp_path, [(ok, "TRT1"), (ok.replace("-", "").replace(".", ""), "TRT1"), ("123", "TRT1"), (_numero(2, "8", "19"), None)])
    assert df.listar_processos(db) == [(ok, "TRT1"), (_numero(2, "8", "19"), "TJRJ")]


def test_cli_sem_chave_nao_consulta(tmp_path, monkeypatch, capsys):
    monkeypatch.delenv("DATAJUD_API_KEY", raising=False)
    db = _banco(tmp_path, [(_numero(1), "TRT1")])
    assert df.main(["--db", str(db)]) == 2
    assert "não encontrada" in capsys.readouterr().out
    assert not (tmp_path / "data" / "datajud_fonte.json").exists()


def test_cli_le_a_chave_do_env_e_grava(tmp_path, monkeypatch, capsys):
    monkeypatch.delenv("DATAJUD_API_KEY", raising=False)
    n = _numero(1)
    db = _banco(tmp_path, [(n, "TRT1")])
    (tmp_path / ".env").write_text("DATAJUD_API_KEY=minhachave\n", encoding="utf-8")
    vistos = {}

    def falso(num, sigla, chave):
        vistos["chave"] = chave
        return [_fonte("2026-09-13T23:02:50.389Z", ["2026-08-12T12:04:56.000Z"])]
    import types
    modulo = types.ModuleType("clients.datajud_client"); modulo.buscar_processo = falso
    pacote = types.ModuleType("clients"); pacote.datajud_client = modulo
    monkeypatch.setitem(sys.modules, "clients", pacote)
    monkeypatch.setitem(sys.modules, "clients.datajud_client", modulo)
    assert df.main(["--db", str(db)]) == 0
    assert vistos["chave"] == "minhachave"
    saida = json.loads((tmp_path / "data" / "datajud_fonte.json").read_text(encoding="utf-8"))
    assert saida["processos"][n]["atualizadoEm"] == "2026-09-13T23:02:50"
    assert n not in capsys.readouterr().out                                # a tela nunca imprime número de processo
