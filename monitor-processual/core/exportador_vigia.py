"""
Exportador monitor -> retrato para a rotina do Claude (e o painel Vigia).

Lê o banco do monitor (`data/monitor.db`) SOMENTE PARA LEITURA e monta, por
processo acompanhado, três coisas:

* `documento`  – documento do painel (contrato de `vigia_contrato`), com o bloco
                 `prazo` do prazo aberto mais próximo;
* `retrato`    – o que `vigia_analise` consome: `novidade`, `termos_sensiveis`,
                 `verificado_em`, `ultimo_andamento_data`, `prazos_abertos`;
* `comunicacoes` – intimações recentes (texto truncado: minimização de dados).

O arquivo gerado contém dados de clientes: fica em `data/` (fora do git) e nunca
deve ser commitado. Este módulo não acessa a rede nem grava no banco.

Uso:  python -m core.exportador_vigia --db data/monitor.db --saida data/retrato_vigia.json
"""
from __future__ import annotations

import argparse
import json
import os
import re
import sqlite3
import unicodedata
from datetime import date, datetime, timedelta
from pathlib import Path

from core import vigia_contrato as vc

HORAS_NOVIDADE = 26          # janela de "novidade": um pouco mais que o ciclo diário
MAX_TEXTO = 1500
MAX_COMUNICACOES = 5
MAX_EVENTOS = 8
TERMOS_SENSIVEIS = (
    "decurso de prazo", "intimacao", "citacao", "sentenca", "audiencia", "penhora",
    "tutela", "bloqueio", "acordao", "transito em julgado", "multa", "revelia",
)


def _sem_acento(s: str) -> str:
    return "".join(c for c in unicodedata.normalize("NFD", s) if unicodedata.category(c) != "Mn").lower()


def _data(v) -> date | None:
    """Aceita AAAA-MM-DD[...] ou DD/MM/AAAA[...]; senão None."""
    s = str(v or "").strip()
    m = re.match(r"^(\d{4})-(\d{2})-(\d{2})", s)
    try:
        if m:
            return date(int(m[1]), int(m[2]), int(m[3]))
        m = re.match(r"^(\d{2})/(\d{2})/(\d{4})", s)
        if m:
            return date(int(m[3]), int(m[2]), int(m[1]))
    except ValueError:
        return None
    return None


def _momento(v) -> datetime | None:
    s = str(v or "").strip().replace("T", " ")
    try:
        return datetime.strptime(s[:19], "%Y-%m-%d %H:%M:%S")
    except ValueError:
        d = _data(s)
        return datetime(d.year, d.month, d.day) if d else None


def _abrir_somente_leitura(caminho: str | os.PathLike) -> sqlite3.Connection:
    p = Path(caminho).resolve()
    if not p.is_file():
        raise FileNotFoundError(f"banco não encontrado: {p}")
    con = sqlite3.connect(f"file:{p.as_posix()}?mode=ro", uri=True)
    con.row_factory = sqlite3.Row
    return con


def _termos(textos) -> list[str]:
    achados = []
    base = " ".join(_sem_acento(str(t or "")) for t in textos)
    for t in TERMOS_SENSIVEIS:
        if t in base:
            achados.append(t)
    return achados


def exportar(db: str | os.PathLike, *, agora: datetime | None = None) -> dict:
    agora = (agora or datetime.now()).replace(microsecond=0)
    corte = agora - timedelta(hours=HORAS_NOVIDADE)
    con = _abrir_somente_leitura(db)
    try:
        acompanhados = [dict(r) for r in con.execute("select * from processos_acompanhados")]
        comunicacoes = [dict(r) for r in con.execute(
            "select * from comunicacoes where coalesce(cancelada,0)=0 order by data_disponibilizacao desc, criado_em desc")]
        movs = [dict(r) for r in con.execute("select * from movimentacoes order by data_movimento desc, id desc")]
        prazos = [dict(r) for r in con.execute("select * from prazos where status='aberto'")]
        ultima_exec = con.execute(
            "select executado_em from execucoes where sucesso=1 order by id desc limit 1").fetchone()
    finally:
        con.close()

    def chave(n):
        return vc.normalizar_numero(n)

    com_por = {}
    for c in comunicacoes:
        com_por.setdefault(chave(c["numero_processo"]), []).append(c)
    mov_por = {}
    for m in movs:
        mov_por.setdefault(chave(m["numero_processo"]), []).append(m)
    prz_por = {}
    for p in prazos:
        prz_por.setdefault(chave(p["numero_processo"]), []).append(p)
    sigla_da_com = {c["id"]: c.get("sigla_tribunal") for c in comunicacoes}

    saida, auditoria = [], []
    vistos = set()
    for ac in acompanhados:
        numero = chave(ac["numero_processo"])
        if numero is None:
            auditoria.append({"tipo": "numero_invalido", "detalhe": "processo acompanhado com número CNJ inválido"})
            continue
        if numero in vistos:
            auditoria.append({"tipo": "duplicado", "detalhe": f"processo repetido em acompanhados: {numero}"})
            continue
        vistos.add(numero)

        coms = com_por.get(numero, [])
        mvs = mov_por.get(numero, [])
        przs = []
        for p in prz_por.get(numero, []):
            lim = _data(p.get("data_limite"))
            if lim is None:
                auditoria.append({"tipo": "prazo_sem_data_limite", "detalhe": f"{numero}: prazo de duração indefinida (conferir à mão)"})
                continue
            przs.append((lim, p))
        przs.sort(key=lambda x: x[0])

        # --- bloco `prazo` (o mais próximo), conferido com o cálculo atual
        bloco = None
        if przs:
            lim, p = przs[0]
            sigla = sigla_da_com.get(p.get("comunicacao_id")) or ac.get("sigla_tribunal") or vc.sigla_do_numero(numero)
            disp = _data(p.get("data_disponibilizacao"))
            tipo = p.get("tipo_contagem")
            if disp and p.get("dias") and tipo in ("uteis", "corridos"):
                try:
                    bloco = vc.montar_prazo(disp, int(p["dias"]), tipo, tribunal=sigla, agora=agora)
                    if bloco["dataLimite"] != lim.isoformat():
                        auditoria.append({
                            "tipo": "prazo_divergente",
                            "detalhe": f"{numero}: banco={lim.isoformat()} recalculado={bloco['dataLimite']} ({bloco['calendario']})"})
                except ValueError as e:
                    auditoria.append({"tipo": "prazo_nao_recalculado", "detalhe": f"{numero}: {e}"})
            if bloco is None:
                pub = _data(p.get("data_publicacao"))
                bloco = {
                    "dataDisponibilizacao": disp.isoformat() if disp else None,
                    "dataPublicacao": pub.isoformat() if pub else None,
                    "dataInicio": p.get("data_inicio_prazo"), "dataLimite": lim.isoformat(),
                    "dias": p.get("dias"), "tipoContagem": tipo, "capital": False, "recessoAplicado": False,
                    "avisos": ["Prazo lido do banco do monitor sem recálculo."], "calendario": "banco do monitor",
                    "calculadoEm": agora.isoformat(),
                }

        # --- retrato
        novas_com = [c for c in coms if (_momento(c.get("criado_em")) or datetime.min) >= corte]
        novas_mov = [m for m in mvs if (_momento(m.get("criado_em")) or datetime.min) >= corte]
        datas_mov = [d for d in (_data(m.get("data_movimento")) for m in mvs) if d]
        retrato = {
            "verificado_em": ultima_exec["executado_em"][:10] if ultima_exec else None,
            "novidade": bool(novas_com or novas_mov),
            "termos_sensiveis": _termos([c.get("texto") for c in novas_com] + [m.get("descricao") for m in novas_mov]),
            "ultimo_andamento_data": max(datas_mov).isoformat() if datas_mov else None,
            "prazos_abertos": [
                {"data_limite": lim.isoformat(),
                 "data_publicacao": d.isoformat() if (d := _data(p.get("data_publicacao"))) else None}
                for lim, p in przs
            ],
        }

        if bloco and retrato["prazos_abertos"]:      # o retrato nunca contradiz o documento
            retrato["prazos_abertos"][0]["data_limite"] = bloco["dataLimite"]
            retrato["prazos_abertos"][0]["data_publicacao"] = bloco["dataPublicacao"]

        # --- documento
        eventos = [{"data": (_data(m["data_movimento"]) or date.min).strftime("%d/%m/%Y"), "texto": str(m.get("descricao") or "")[:200]}
                   for m in mvs[:MAX_EVENTOS] if _data(m.get("data_movimento"))]
        proc = {
            "numero": numero,
            "tribunal": vc.tribunal_curto(numero),
            "nomeLocal": ac.get("apelido") or None,
            "eventos": eventos,
        }
        if datas_mov:
            ult = next(m for m in mvs if _data(m.get("data_movimento")) == max(datas_mov))
            proc["ultimaMovData"] = max(datas_mov).isoformat()
            proc["ultimaMovResumo"] = str(ult.get("descricao") or "")[:200]
        proc = {k: v for k, v in proc.items() if v not in (None, [])}
        doc = vc.montar_documento(proc, prazo=bloco, agora=agora)

        saida.append({
            "documento": doc,
            "retrato": retrato,
            "comunicacoes": [
                {"data_disponibilizacao": c.get("data_disponibilizacao"), "texto": str(c.get("texto") or "")[:MAX_TEXTO]}
                for c in coms[:MAX_COMUNICACOES]
            ],
        })

    return {"gerado_em": agora.isoformat(), "processos": saida, "auditoria": auditoria}


def gravar(retrato: dict, destino: str | os.PathLike) -> Path:
    """Grava de forma atômica (arquivo temporário + rename)."""
    d = Path(destino)
    d.parent.mkdir(parents=True, exist_ok=True)
    tmp = d.with_suffix(d.suffix + ".tmp")
    tmp.write_text(json.dumps(retrato, ensure_ascii=False, indent=2), encoding="utf-8")
    os.replace(tmp, d)
    return d


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[1])
    ap.add_argument("--db", default="data/monitor.db")
    ap.add_argument("--saida", default="data/retrato_vigia.json")
    a = ap.parse_args(argv)
    r = exportar(a.db)
    gravar(r, a.saida)
    abertos = sum(len(p["retrato"]["prazos_abertos"]) for p in r["processos"])
    print(f"{len(r['processos'])} processo(s), {abertos} prazo(s) aberto(s), "
          f"{sum(p['retrato']['novidade'] for p in r['processos'])} com novidade, "
          f"{len(r['auditoria'])} aviso(s) -> {a.saida}")
    for item in r["auditoria"]:
        print(f"  [{item['tipo']}]")      # detalhe fica no arquivo (pode conter número de processo)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
