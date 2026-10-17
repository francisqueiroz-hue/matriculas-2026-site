"""Importação de números do painel para a lista do monitor (core/importar_painel.py). Só dados sintéticos."""
import json
import os
import sys
from datetime import datetime, timedelta

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import pytest  # noqa: E402

from core import importar_painel as ip  # noqa: E402

AGORA = datetime(2026, 10, 14, 9, 0, 0)


def _numero(seq, j="5", tr="01"):
    n = f"{seq:07d}"
    dd = 98 - int(n + "2020" + j + tr + "0001" + "00") % 97
    return f"{n}-{dd:02d}.2020.{j}.{tr}.0001"


def _escrever(p, obj, bom=False):
    b = json.dumps(obj, ensure_ascii=False, indent=2).encode("utf-8")
    p.write_bytes((b"\xef\xbb\xbf" if bom else b"") + b)


def _origem(tmp_path, numeros, gerado=AGORA, nome="Caso"):
    p = tmp_path / "numeros_painel.json"
    _escrever(p, {"gerado_em": gerado.isoformat(), "processos": [{"numero": n, "nome": f"{nome} {i}"} for i, n in enumerate(numeros)]})
    return p


def _lista(tmp_path, numeros, bom=False):
    p = tmp_path / "processos.json"
    _escrever(p, [{"nome": "existente", "numero": n, "ultimo_hash_movimentos": "abc",
                   "ultima_verificacao": "2026-10-13", "ultimo_andamento_visto": "x"} for n in numeros], bom=bom)
    return p


def test_inclui_so_o_que_falta_sem_mexer_no_resto(tmp_path):
    a, b, c = _numero(1), _numero(2), _numero(3)
    lista = _lista(tmp_path, [a, b])
    r = ip.importar(_origem(tmp_path, [a, b, c]), lista, agora=AGORA)
    assert (r["no_painel"], r["ja_na_lista"], r["incluidos"], r["adiados"]) == (3, 2, 1, 0)
    dados = json.loads(lista.read_text(encoding="utf-8"))
    assert [e["numero"] for e in dados] == [a, b, c]
    assert dados[0]["ultimo_hash_movimentos"] == "abc"          # entradas antigas intactas
    assert dados[2] == {"nome": "Caso 2", "numero": c, "ultimo_hash_movimentos": None,
                        "ultima_verificacao": None, "ultimo_andamento_visto": None}
    assert (tmp_path / r["backup"]).is_file()


def test_idempotente_segunda_execucao_nao_muda_nada(tmp_path):
    a, b = _numero(1), _numero(2)
    lista = _lista(tmp_path, [a])
    origem = _origem(tmp_path, [a, b])
    ip.importar(origem, lista, agora=AGORA)
    antes = lista.read_bytes()
    r = ip.importar(origem, lista, agora=AGORA + timedelta(minutes=1))
    assert r["incluidos"] == 0 and r["backup"] is None and lista.read_bytes() == antes


def test_formato_diferente_do_numero_e_reconhecido_como_o_mesmo(tmp_path):
    a = _numero(1)
    lista = _lista(tmp_path, [a.replace("-", "").replace(".", "")])
    r = ip.importar(_origem(tmp_path, [a]), lista, agora=AGORA)
    assert r["incluidos"] == 0


def test_numero_invalido_e_duplicado_na_origem_sao_ignorados(tmp_path):
    a = _numero(1)
    lista = _lista(tmp_path, [])
    origem = _origem(tmp_path, [a, a, "123", "0000000-00.0000.0.00.0000"])
    r = ip.importar(origem, lista, agora=AGORA)
    assert (r["no_painel"], r["incluidos"]) == (1, 1)


def test_limite_por_execucao(tmp_path):
    nums = [_numero(i) for i in range(1, 16)]
    lista = _lista(tmp_path, [])
    r = ip.importar(_origem(tmp_path, nums), lista, agora=AGORA)
    assert (r["incluidos"], r["adiados"]) == (ip.MAX_INCLUSOES, 5)
    r2 = ip.importar(_origem(tmp_path, nums), lista, agora=AGORA)
    assert (r2["incluidos"], r2["adiados"]) == (5, 0)


def test_origem_velha_recusada_e_nada_muda(tmp_path):
    lista = _lista(tmp_path, [_numero(1)])
    antes = lista.read_bytes()
    origem = _origem(tmp_path, [_numero(2)], gerado=AGORA - timedelta(days=8))
    with pytest.raises(ip.ErroImportacao):
        ip.importar(origem, lista, agora=AGORA)
    assert lista.read_bytes() == antes and not list(tmp_path.glob("*.bak_*"))


def test_lista_que_nao_e_lista_nao_e_tocada(tmp_path):
    lista = tmp_path / "processos.json"
    _escrever(lista, {"processos": []})
    antes = lista.read_bytes()
    with pytest.raises(ip.ErroImportacao):
        ip.importar(_origem(tmp_path, [_numero(1)]), lista, agora=AGORA)
    assert lista.read_bytes() == antes


def test_json_corrompido_e_arquivos_ausentes(tmp_path):
    lista = _lista(tmp_path, [])
    ruim = tmp_path / "numeros_painel.json"
    ruim.write_text("{ não é json", encoding="utf-8")
    with pytest.raises(ip.ErroImportacao):
        ip.importar(ruim, lista, agora=AGORA)
    with pytest.raises(ip.ErroImportacao):
        ip.importar(tmp_path / "nao_existe.json", lista, agora=AGORA)
    with pytest.raises(ip.ErroImportacao):
        ip.importar(_origem(tmp_path, [_numero(1)]), tmp_path / "nao_existe.json", agora=AGORA)


def test_preserva_bom_e_acentos(tmp_path):
    a = _numero(1)
    lista = _lista(tmp_path, [], bom=True)
    origem = tmp_path / "numeros_painel.json"
    _escrever(origem, {"gerado_em": AGORA.isoformat(), "processos": [{"numero": a, "nome": "Ação — José"}]})
    ip.importar(origem, lista, agora=AGORA)
    bruto = lista.read_bytes()
    assert bruto.startswith(b"\xef\xbb\xbf") and bruto.endswith(b"\n")
    assert json.loads(bruto.decode("utf-8-sig"))[0]["nome"] == "Ação — José"


def test_simular_nao_grava(tmp_path):
    lista = _lista(tmp_path, [])
    antes = lista.read_bytes()
    r = ip.importar(_origem(tmp_path, [_numero(1)]), lista, agora=AGORA, simular=True)
    assert r["incluidos"] == 1 and r["simulado"] is True and lista.read_bytes() == antes


def test_backups_antigos_sao_podados(tmp_path):
    lista = _lista(tmp_path, [])
    for i in range(7):
        ip.importar(_origem(tmp_path, [_numero(100 + i)]), lista, agora=AGORA + timedelta(seconds=i))
    assert len(list(tmp_path.glob("processos.json.bak_*"))) == ip.MAX_BACKUPS


def test_cli_nao_imprime_numero_de_processo(tmp_path, capsys):
    a = _numero(1)
    lista = _lista(tmp_path, [])
    origem = _origem(tmp_path, [a], gerado=datetime.now())
    assert ip.main(["--origem", str(origem), "--lista", str(lista)]) == 0
    assert a not in capsys.readouterr().out
    assert ip.main(["--origem", str(origem)]) in (1, 2)
