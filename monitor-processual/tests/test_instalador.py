"""
Testes do instalador (instalacao/instalar_calendarios.py) numa pasta FICTÍCIA de
monitor: instalação, backup, preservação de quebras de linha, falha forçada com
desfazer, idempotência, reverter e recusas. Nenhum dado real.
"""
import hashlib
import importlib.util
import json
import shutil
import subprocess
import sys
from pathlib import Path

import pytest

RAIZ = Path(__file__).resolve().parent.parent
INSTALADOR = RAIZ / "instalacao" / "instalar_calendarios.py"

RUN_DAILY = '''import config
from core.calendar_prazos import calcular_prazo


def criar_prazo_para(conn, comunicacao, classificacao):
    data_disp = comunicacao["data"]
    dias = classificacao.get("dias_prazo")
    if data_disp and dias:
        try:
            r = calcular_prazo(
                data_disp,
                dias,
                classificacao.get("tipo_contagem") or "uteis",
                config.FERIADOS_FORENSES_EXTRAS,
                aplicar_recesso=config.APLICAR_RECESSO_ART_220,
            )
        except Exception:
            return False
    return True
'''
CLASSIFICADOR_OK = '''import re


def classificar_texto(t):
    m = re.search(r"(\\d+)\\s*(?:\\([a-z]+\\)\\s*)?dias?\\s*(úteis|uteis|corridos)?", t)
    if not m:
        return {"dias_prazo": None, "tipo_contagem": None}
    tipo = "corridos" if m.group(2) == "corridos" else "uteis" if m.group(2) else None
    return {"dias_prazo": int(m.group(1)), "tipo_contagem": tipo}
'''
CLASSIFICADOR_RUIM = CLASSIFICADOR_OK.replace('"uteis" if m.group(2) else None', '"dias_uteis"')
DATAS = '''import re
from datetime import date


def para_data(v):
    if v is None:
        return None
    s = str(v).strip()
    m = re.match(r"^(\\d{2})/(\\d{2})/(\\d{4})", s)
    if m:
        return date(int(m[3]), int(m[2]), int(m[1]))
    m = re.match(r"^(\\d{4})-(\\d{2})-(\\d{2})", s)
    return date(int(m[1]), int(m[2]), int(m[3])) if m else None
'''


def h(p: Path) -> str:
    return hashlib.sha256(p.read_bytes()).hexdigest()


def foto(pasta: Path) -> dict:
    return {str(p.relative_to(pasta)): h(p) for p in sorted(pasta.rglob("*")) if p.is_file()}


@pytest.fixture
def monitor(tmp_path):
    d = tmp_path / "monitor"
    (d / "core").mkdir(parents=True)
    (d / "tests").mkdir()
    (d / "run_daily.py").write_text(RUN_DAILY, encoding="utf-8", newline="")
    (d / "core" / "__init__.py").write_text("", encoding="utf-8")
    (d / "core" / "calendar_prazos.py").write_text("# calendário ANTIGO\n", encoding="utf-8")
    (d / "core" / "classifier.py").write_text(CLASSIFICADOR_OK, encoding="utf-8")
    (d / "core" / "datas.py").write_text(DATAS, encoding="utf-8")
    (d / "tests" / "test_prazos.py").write_text("# teste ANTIGO\n", encoding="utf-8")
    (d / "tests" / "test_integracao.py").write_text("# não pode ser tocado\n", encoding="utf-8")
    return d


def rodar(destino, *extra, origem=None):
    cmd = [sys.executable, str(INSTALADOR), "--destino", str(destino), *extra]
    if origem:
        cmd += ["--origem", str(origem)]
    return subprocess.run(cmd, capture_output=True, text=True, encoding="utf-8")


def backups(destino):
    return sorted(destino.glob("_backup_calendarios_*"))


def test_instala_com_backup_e_corrige_o_run_daily(monitor):
    antes = foto(monitor)
    r = rodar(monitor, "--sim", "--sem-pytest")
    assert r.returncode == 0, r.stdout + r.stderr
    assert "INSTALADO COM SUCESSO" in r.stdout
    for f in ("calendar_prazos", "calendarios", "calendario_tjrj", "calendario_trt1", "calendario_nacional", "vigia_contrato"):
        assert h(monitor / "core" / f"{filename(f)}") == h(RAIZ / "core" / f"{filename(f)}")
    texto = (monitor / "run_daily.py").read_text(encoding="utf-8")
    assert texto.count('tribunal=comunicacao.get("sigla_tribunal"),') == 1
    assert '                aplicar_recesso=config.APLICAR_RECESSO_ART_220,\n                tribunal=comunicacao' in texto
    (b,) = backups(monitor)
    man = json.loads((b / "MANIFESTO.json").read_text(encoding="utf-8"))
    assert {i["rel"] for i in man["itens"]} >= {"run_daily.py", "core/calendar_prazos.py", "tests/test_prazos.py"}
    assert (b / "core" / "calendar_prazos.py").read_text(encoding="utf-8") == "# calendário ANTIGO\n"
    assert h(b / "run_daily.py") == antes["run_daily.py"]
    assert (b / "instalacao.log").is_file()
    # o que não é do pacote não pode ser tocado
    assert h(monitor / "tests" / "test_integracao.py") == antes["tests/test_integracao.py"]
    assert h(monitor / "core" / "classifier.py") == antes["core/classifier.py"]


def filename(f):
    return f + ".py"


def test_preserva_crlf_e_bom(monitor):
    dados = ("﻿" + RUN_DAILY).replace("\n", "\r\n").encode("utf-8")
    (monitor / "run_daily.py").write_bytes(dados)
    r = rodar(monitor, "--sim", "--sem-pytest")
    assert r.returncode == 0, r.stdout
    novo = (monitor / "run_daily.py").read_bytes()
    assert novo.startswith("﻿".encode("utf-8"))
    assert b"\n" not in novo.replace(b"\r\n", b"")
    assert novo.count(b'tribunal=comunicacao.get("sigla_tribunal"),\r\n') == 1


def test_simular_nao_altera_nada(monitor):
    antes = foto(monitor)
    r = rodar(monitor, "--simular")
    assert r.returncode == 0 and "nada foi alterado" in r.stdout
    assert foto(monitor) == antes and not backups(monitor)


def test_falha_no_teste_de_fumaca_desfaz_tudo(monitor):
    (monitor / "core" / "classifier.py").write_text(CLASSIFICADOR_RUIM, encoding="utf-8")
    antes = foto(monitor)
    r = rodar(monitor, "--sim", "--sem-pytest")
    assert r.returncode == 1, r.stdout
    assert "FALHOU" in r.stdout and "Estado anterior restaurado" in r.stdout
    depois = {k: v for k, v in foto(monitor).items() if not k.startswith("_backup_calendarios_")}
    assert depois == antes  # byte a byte, incluindo remoção dos arquivos criados
    assert len(backups(monitor)) == 1


def test_recusa_quando_nao_acha_a_linha_do_run_daily(monitor):
    (monitor / "run_daily.py").write_text("def criar_prazo_para():\n    return calcular_prazo(1, 2)\n", encoding="utf-8")
    antes = foto(monitor)
    r = rodar(monitor, "--sim", "--sem-pytest")
    assert r.returncode == 2 and "NADA foi alterado" in r.stdout
    assert foto(monitor) == antes and not backups(monitor)


def test_sem_patch_instala_sem_tocar_no_run_daily(monitor):
    antes = h(monitor / "run_daily.py")
    r = rodar(monitor, "--sim", "--sem-pytest", "--sem-patch-run-daily")
    assert r.returncode == 0, r.stdout
    assert h(monitor / "run_daily.py") == antes
    assert (monitor / "core" / "calendarios.py").is_file()


def test_segunda_execucao_e_idempotente(monitor):
    assert rodar(monitor, "--sim", "--sem-pytest").returncode == 0
    depois_1 = foto(monitor)
    r = rodar(monitor, "--sim", "--sem-pytest")
    assert r.returncode == 0 and "Já instalado" in r.stdout
    assert foto(monitor) == depois_1 and len(backups(monitor)) == 1


def test_reverter_restaura_o_estado_original(monitor):
    antes = foto(monitor)
    assert rodar(monitor, "--sim", "--sem-pytest").returncode == 0
    (b,) = backups(monitor)
    r = rodar(monitor, "--reverter", str(b), "--sim")
    assert r.returncode == 0 and "Backup restaurado" in r.stdout
    depois = {k: v for k, v in foto(monitor).items() if not k.startswith("_backup_calendarios_")}
    assert depois == antes


def test_avisa_sobre_outros_arquivos_que_chamam_calcular_prazo(monitor):
    (monitor / "dashboard.py").write_text("from core.calendar_prazos import calcular_prazo\nx = calcular_prazo(1, 2)\n", encoding="utf-8")
    r = rodar(monitor, "--simular")
    assert "dashboard.py" in r.stdout and "NÃO serão alterados" in r.stdout


def test_destino_invalido(tmp_path):
    r = rodar(tmp_path / "nao_existe", "--sim")
    assert r.returncode == 2 and "destino não existe" in r.stdout
    pasta = tmp_path / "vazia"
    pasta.mkdir()
    r = rodar(pasta, "--sim")
    assert r.returncode == 2 and "não parece ser a pasta do monitor" in r.stdout


def test_detecta_pacote_corrompido_pelo_sha256(monitor, tmp_path):
    pacote = tmp_path / "pacote"
    shutil.copytree(RAIZ / "core", pacote / "core", ignore=shutil.ignore_patterns("__pycache__"))
    shutil.copytree(RAIZ / "tests", pacote / "tests", ignore=shutil.ignore_patterns("__pycache__"))
    versao = {f"core/{f}": h(pacote / "core" / f) for f in ("calendar_prazos.py", "calendarios.py")}
    (pacote / "VERSAO.json").write_text(json.dumps(versao), encoding="utf-8")
    assert rodar(monitor, "--simular", origem=pacote).returncode == 0  # íntegro
    (pacote / "core" / "calendarios.py").write_text("# adulterado\n", encoding="utf-8")
    r = rodar(monitor, "--simular", origem=pacote)
    assert r.returncode == 2 and "SHA-256 diferente" in r.stdout


def test_verificar_roda_a_fumaca_sem_alterar(monitor):
    assert rodar(monitor, "--sim", "--sem-pytest").returncode == 0
    antes = foto(monitor)
    r = rodar(monitor, "--verificar", "--sem-pytest")
    assert r.returncode == 0 and "Resultado: OK" in r.stdout
    assert foto(monitor) == antes


def test_instalacao_completa_com_os_testes_do_pacote(monitor):
    pytest.importorskip("pytest")
    r = rodar(monitor, "--sim")
    assert r.returncode == 0, r.stdout + r.stderr
    assert "testes do pacote:" in r.stdout and "passed" in r.stdout and "failed" not in r.stdout


def _carregar():
    spec = importlib.util.spec_from_file_location("instalador", INSTALADOR)
    m = importlib.util.module_from_spec(spec)
    sys.modules["instalador"] = m
    spec.loader.exec_module(m)
    return m


def test_aplicar_patch_estados():
    m = _carregar()
    novo, st = m.aplicar_patch(RUN_DAILY)
    assert st == "aplicado" and m.chamadas_com_tribunal(novo) == (1, 1)
    assert m.aplicar_patch(novo) == (novo, "ja_aplicado")
    duplo = RUN_DAILY + "\n" + RUN_DAILY.replace("criar_prazo_para", "outra")
    assert m.aplicar_patch(duplo)[1] == "ambiguo"
    assert m.aplicar_patch("x = 1\n")[1] == "nao_encontrado"
