"""
Frescor da FONTE no DataJud (CNJ): quando o próprio DataJud atualizou cada processo.

A data da nossa coleta diz quando perguntamos; ela não diz se o DataJud tem dado novo.
Para o TRT1 a fonte chegou a ficar cerca de um mês sem atualizar, e um painel que só
mostra a data da coleta parece mais atual do que é. Este módulo consulta o DataJud (a
mesma API pública e o mesmo cliente do monitor), guarda `dataHoraUltimaAtualizacao` e a
data da última movimentação em `data/datajud_fonte.json`, e o exportador leva isso ao painel.

Não escreve no banco do monitor. Uma consulta por processo, com a pausa do cliente.
Não imprime números de processo. Termos de uso do CNJ: uso próprio, sem redistribuição.

Uso:  python -m core.datajud_fonte --db data/monitor.db
"""
from __future__ import annotations

import argparse
import json
import os
import re
import sqlite3
from datetime import datetime
from pathlib import Path
from typing import Callable

from core import vigia_contrato as vc

SIGLAS_ACEITAS = None      # qualquer sigla mapeada em core/tribunais.py; as demais viram erro por processo


def _iso(v) -> str | None:
    s = str(v or "").strip().replace("Z", "")
    m = re.match(r"^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}:\d{2})?", s)
    return m.group(0) if m else None


def resumir(sources: list[dict]) -> dict | None:
    """Junta os documentos do índice (1º e 2º grau): vale o mais recente de cada campo."""
    atualizacoes, movimentos = [], []
    for s in sources or []:
        a = _iso(s.get("dataHoraUltimaAtualizacao"))
        if a:
            atualizacoes.append(a)
        for m in s.get("movimentos") or []:
            d = _iso(m.get("dataHora"))
            if d:
                movimentos.append(d)
    if not atualizacoes and not movimentos:
        return None
    return {
        "atualizadoEm": max(atualizacoes) if atualizacoes else None,
        "ultimoMovimento": max(movimentos) if movimentos else None,
    }


def ler_env(arquivo: Path) -> dict:
    """Leitor mínimo de .env (CHAVE=valor); sem expandir variáveis nem executar nada."""
    saida = {}
    try:
        for linha in arquivo.read_text(encoding="utf-8-sig").splitlines():
            linha = linha.strip()
            if not linha or linha.startswith("#") or "=" not in linha:
                continue
            k, v = linha.split("=", 1)
            saida[k.strip()] = v.strip().strip('"').strip("'")
    except OSError:
        pass
    return saida


def coletar(processos: list[tuple[str, str]], api_key: str, *, buscar: Callable | None = None,
            anterior: dict | None = None, agora: datetime | None = None) -> dict:
    """
    `processos`: [(número CNJ formatado, sigla do tribunal)]. Devolve
    {"gerado_em", "processos": {numero: {...}}, "erros": [{"tipo"}], "interrompido": bool}.
    Quem falhar mantém o valor anterior (com a data da última tentativa bem-sucedida).
    """
    if buscar is None:
        from clients.datajud_client import buscar_processo as buscar   # cliente do monitor
    agora = (agora or datetime.now()).replace(microsecond=0)
    resultado = {k: dict(v) for k, v in ((anterior or {}).get("processos") or {}).items()}
    erros, interrompido = [], False
    for numero, sigla in processos:
        digitos = re.sub(r"\D", "", numero)
        try:
            fontes = buscar(digitos, sigla, api_key)
        except Exception as e:                              # noqa: BLE001 - uma falha não derruba as demais
            msg = str(e)
            erros.append({"tipo": type(e).__name__, "codigo": msg[:8] if msg.startswith("HTTP") else ""})
            if msg.startswith(("HTTP 401", "HTTP 403")):    # chave ruim/bloqueio: insistir só piora
                interrompido = True
                break
            continue
        r = resumir(fontes)
        if r is None:
            erros.append({"tipo": "sem_dados", "codigo": ""})
            continue
        r["verificadoEm"] = agora.isoformat()
        resultado[numero] = r
    return {"gerado_em": agora.isoformat(), "processos": resultado, "erros": erros, "interrompido": interrompido}


def carregar(caminho: str | os.PathLike) -> dict:
    try:
        d = json.loads(Path(caminho).read_text(encoding="utf-8-sig"))
        return d if isinstance(d, dict) and isinstance(d.get("processos"), dict) else {}
    except (OSError, ValueError):
        return {}


def gravar(dados: dict, destino: str | os.PathLike) -> Path:
    d = Path(destino)
    d.parent.mkdir(parents=True, exist_ok=True)
    tmp = d.with_suffix(d.suffix + ".tmp")
    tmp.write_text(json.dumps(dados, ensure_ascii=False, indent=2), encoding="utf-8")
    os.replace(tmp, d)
    return d


def listar_processos(db: str | os.PathLike) -> list[tuple[str, str]]:
    p = Path(db).resolve()
    con = sqlite3.connect(f"file:{p.as_posix()}?mode=ro", uri=True)
    try:
        linhas = con.execute("select numero_processo, sigla_tribunal from processos_acompanhados").fetchall()
    finally:
        con.close()
    saida, vistos = [], set()
    for numero, sigla in linhas:
        n = vc.normalizar_numero(numero)
        if n is None or n in vistos:
            continue
        vistos.add(n)
        saida.append((n, sigla or vc.sigla_do_numero(n) or ""))
    return saida


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description="Registra quando o DataJud atualizou cada processo.")
    ap.add_argument("--db", default="data/monitor.db")
    ap.add_argument("--saida", default="")
    a = ap.parse_args(argv)
    db = Path(a.db).resolve()
    saida = Path(a.saida) if a.saida else db.parent / "datajud_fonte.json"
    chave = os.environ.get("DATAJUD_API_KEY") or ler_env(db.parent.parent / ".env").get("DATAJUD_API_KEY", "")
    if not chave:
        print("DATAJUD_API_KEY não encontrada (variável de ambiente ou .env). Nada foi consultado.")
        return 2
    r = coletar(listar_processos(db), chave, anterior=carregar(saida))
    gravar(r, saida)
    print(f"{len(r['processos'])} processo(s) com data da fonte, {len(r['erros'])} falha(s)"
          + (" — interrompido por HTTP 401/403: confira a chave no .env" if r["interrompido"] else ""))
    return 1 if r["interrompido"] else 0


if __name__ == "__main__":
    raise SystemExit(main())
