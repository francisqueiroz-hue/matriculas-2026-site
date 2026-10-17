"""
Importa para a lista do monitor os processos que existem no painel e ainda não
estão na lista (cadastrados por e-mail pelo Radar ou à mão no painel).

Fluxo: a rotina Radar (nuvem) grava `numeros_painel.json` na pasta privada do
Drive; este módulo (computador) lê o arquivo e ACRESCENTA ao final do
`processos.json` o que faltar. Nunca remove nem altera entradas existentes.

Travas: número CNJ com dígito verificador conferido; arquivo de origem com no
máximo 7 dias; no máximo 10 inclusões por execução; backup do `processos.json`
antes de gravar; gravação atômica. Não acessa a rede.

Formato de entrada: {"gerado_em": "AAAA-MM-DDTHH:MM:SS", "processos": [{"numero": "...", "nome": "..."}]}
Entrada de `processos.json` criada: {"nome", "numero", "ultimo_hash_movimentos": null,
"ultima_verificacao": null, "ultimo_andamento_visto": null} (o mesmo formato do Vigia).

Uso:  python -m core.importar_painel --origem <numeros_painel.json> --lista <processos.json>
"""
from __future__ import annotations

import argparse
import json
import os
import shutil
from datetime import datetime, timedelta
from pathlib import Path

from core import vigia_contrato as vc

MAX_INCLUSOES = 10
MAX_IDADE_DIAS = 7
MAX_BACKUPS = 5
MAX_NOME = 120


class ErroImportacao(Exception):
    pass


def _ler_json(caminho: Path):
    bruto = caminho.read_bytes()
    bom = bruto.startswith(b"\xef\xbb\xbf")
    try:
        return json.loads(bruto.decode("utf-8-sig")), bom
    except (UnicodeDecodeError, json.JSONDecodeError) as e:
        raise ErroImportacao(f"JSON inválido em {caminho.name}: {e}") from e


def _momento(v):
    try:
        return datetime.fromisoformat(str(v).replace("Z", "")[:19])
    except ValueError:
        return None


def ler_numeros_do_painel(origem: Path, agora: datetime) -> list[dict]:
    dados, _ = _ler_json(origem)
    if not isinstance(dados, dict) or not isinstance(dados.get("processos"), list):
        raise ErroImportacao("origem sem a lista 'processos'")
    gerado = _momento(dados.get("gerado_em"))
    if gerado is None:
        raise ErroImportacao("origem sem 'gerado_em' válido")
    if agora - gerado > timedelta(days=MAX_IDADE_DIAS):
        raise ErroImportacao(f"origem com mais de {MAX_IDADE_DIAS} dias ({gerado:%d/%m/%Y})")
    vistos, saida = set(), []
    for item in dados["processos"]:
        if not isinstance(item, dict):
            continue
        n = vc.normalizar_numero(item.get("numero"))
        if n is None or n in vistos:
            continue
        vistos.add(n)
        nome = " ".join(str(item.get("nome") or "").split())[:MAX_NOME]
        saida.append({"numero": n, "nome": nome or f"Painel — {n}"})
    return saida


def importar(origem: str | os.PathLike, lista: str | os.PathLike, *, agora: datetime | None = None,
             simular: bool = False) -> dict:
    agora = (agora or datetime.now()).replace(microsecond=0)
    origem, lista = Path(origem), Path(lista)
    if not origem.is_file():
        raise ErroImportacao(f"arquivo de origem não encontrado: {origem.name}")
    if not lista.is_file():
        raise ErroImportacao(f"lista do monitor não encontrada: {lista}")

    painel = ler_numeros_do_painel(origem, agora)
    atual, bom = _ler_json(lista)
    if not isinstance(atual, list):
        raise ErroImportacao("a lista do monitor não é uma lista JSON; nada foi alterado")
    existentes = {vc.normalizar_numero(e.get("numero")) for e in atual if isinstance(e, dict)}
    novos = [p for p in painel if p["numero"] not in existentes]
    a_incluir, adiados = novos[:MAX_INCLUSOES], novos[MAX_INCLUSOES:]
    resumo = {"no_painel": len(painel), "ja_na_lista": len(painel) - len(novos),
              "incluidos": len(a_incluir), "adiados": len(adiados), "simulado": simular, "backup": None}
    if not a_incluir or simular:
        return resumo

    backup = lista.with_name(f"{lista.name}.bak_{agora:%Y%m%d_%H%M%S}")
    shutil.copy2(lista, backup)
    resumo["backup"] = backup.name
    for p in a_incluir:
        atual.append({"nome": p["nome"], "numero": p["numero"], "ultimo_hash_movimentos": None,
                      "ultima_verificacao": None, "ultimo_andamento_visto": None})
    texto = json.dumps(atual, ensure_ascii=False, indent=2) + "\n"
    tmp = lista.with_name(lista.name + ".tmp")
    tmp.write_bytes((b"\xef\xbb\xbf" if bom else b"") + texto.encode("utf-8"))
    os.replace(tmp, lista)
    for velho in sorted(lista.parent.glob(lista.name + ".bak_*"))[:-MAX_BACKUPS]:
        velho.unlink(missing_ok=True)
    return resumo


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description="Importa do painel os processos que faltam na lista do monitor.")
    ap.add_argument("--origem", required=True, help="numeros_painel.json (pasta do Drive)")
    ap.add_argument("--lista", default=os.environ.get("VIGIA_PROCESSOS_JSON", ""), help="processos.json do monitor")
    ap.add_argument("--simular", action="store_true")
    a = ap.parse_args(argv)
    if not a.lista:
        print("Informe --lista ou defina VIGIA_PROCESSOS_JSON.")
        return 2
    try:
        r = importar(a.origem, a.lista, simular=a.simular)
    except ErroImportacao as e:
        print(f"Importação não realizada: {e}")
        return 1
    print(f"painel: {r['no_painel']} | já na lista: {r['ja_na_lista']} | incluídos: {r['incluidos']}"
          f" | adiados: {r['adiados']}" + (" | (simulação)" if r["simulado"] else "") +
          (f" | backup: {r['backup']}" if r["backup"] else ""))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
