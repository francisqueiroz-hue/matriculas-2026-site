#!/usr/bin/env python3
"""
Instalador dos calendários por tribunal (TJRJ, TRT1 e reserva nacional) no
monitor processual — com backup, correção do run_daily.py, teste de fumaça e
desfazer automático.

Uso (com o Python do ambiente virtual DO MONITOR que roda na tarefa agendada):

    python instalacao\\instalar_calendarios.py --destino "<pasta do monitor>" --simular
    python instalacao\\instalar_calendarios.py --destino "<pasta do monitor>"
    python instalacao\\instalar_calendarios.py --destino "<pasta do monitor>" --verificar
    python instalacao\\instalar_calendarios.py --reverter "<pasta do monitor>\\_backup_calendarios_AAAAMMDD_HHMMSS"

O que faz, nesta ordem:
  1. confere a origem (arquivos do pacote, com SHA-256 se houver VERSAO.json) e o
     destino (run_daily.py e core/calendar_prazos.py existem);
  2. mostra o plano e pede confirmação (--sim dispensa);
  3. copia para <destino>\\_backup_calendarios_<data_hora>\\ tudo o que vai ser
     substituído, mais um MANIFESTO.json;
  4. copia os arquivos novos (core/ e tests/);
  5. corrige UMA linha do run_daily.py: a chamada de calcular_prazo passa a
     receber tribunal=comunicacao.get("sigla_tribunal"). Sem essa correção o
     calendário por tribunal não é usado, então, se a linha não for encontrada,
     NADA é instalado (a menos que você passe --sem-patch-run-daily);
  6. teste de fumaça: importa os módulos, confere datas conhecidas, passa
     amostras pelo SEU classificador e roda os testes do pacote (se o pytest
     estiver instalado). Não executa o run_daily.py, não acessa rede, não grava
     no banco;
  7. se qualquer etapa falhar, restaura o backup e remove o que foi criado.

Código de saída: 0 = ok; 1 = falhou e foi desfeito; 2 = abortado antes de mexer.
"""
from __future__ import annotations

import argparse
import ast
import datetime as dt
import hashlib
import json
import os
import re
import shutil
import subprocess
import sys
from pathlib import Path

ARQUIVOS_CORE = [
    "calendar_prazos.py", "calendarios.py", "calendario_tjrj.py", "calendario_tjsp.py",
    "calendario_trt1.py", "calendario_nacional.py", "vigia_contrato.py",
    "vigia_analise.py", "exportador_vigia.py",
]
ARQUIVOS_TESTES = [
    "test_prazos.py", "test_calendarios.py", "test_vigia_contrato.py",
    "test_vigia_analise.py", "test_exportador_vigia.py", "test_calendario_tjsp.py",
]
PREFIXO_BACKUP = "_backup_calendarios_"
IGNORAR_NA_VARREDURA = {"venv", ".venv", "env", "__pycache__", ".git", "node_modules", "site-packages", "core", "tests"}

SMOKE = r'''
import json, sys
from datetime import date, datetime
res = []
def chk(nome, cond, detalhe=""):
    res.append({"nome": nome, "ok": bool(cond), "detalhe": str(detalhe)})
try:
    from core.calendar_prazos import calcular_prazo, eh_dia_util
    from core import calendarios
    chk("importa os módulos novos", True)
except Exception as e:
    chk("importa os módulos novos", False, repr(e)); print(json.dumps(res)); sys.exit(0)
def lim(*a, **k):
    return calcular_prazo(*a, **k)["data_limite"]
try:
    chk("TJRJ (padrão): disp. 01/04/2026, 15 úteis -> 30/04/2026", lim(date(2026, 4, 1), 15) == date(2026, 4, 30), lim(date(2026, 4, 1), 15))
    chk("TJRJ explícito igual ao padrão", lim(date(2026, 4, 1), 15, tribunal="TJRJ") == lim(date(2026, 4, 1), 15))
    chk("TRT1: seg 30/03/2026, 3 úteis -> 08/04/2026", lim(date(2026, 3, 30), 3, tribunal="TRT1") == date(2026, 4, 8), lim(date(2026, 3, 30), 3, tribunal="TRT1"))
    chk("TJRJ: mesma entrada -> 07/04/2026", lim(date(2026, 3, 30), 3, tribunal="TJRJ") == date(2026, 4, 7))
    chk("01/04/2026: TRT1 não útil, TJRJ útil", (not eh_dia_util(date(2026, 4, 1), tribunal="TRT1")) and eh_dia_util(date(2026, 4, 1), tribunal="TJRJ"))
    chk("TJSP: qua 08/07/2026, 3 úteis -> 16/07/2026 (Data Magna e 10/07 sem expediente)", lim(date(2026, 7, 8), 3, tribunal="TJSP") == date(2026, 7, 16), lim(date(2026, 7, 8), 3, tribunal="TJSP"))
    r = calcular_prazo(date(2026, 3, 6), 5, tribunal="TRF2")
    chk("tribunal sem perfil usa a reserva e avisa", r["calendario_reserva"] and any("NÃO cadastrado" in a for a in r["avisos"]))
    try:
        calcular_prazo(date(2026, 3, 6), 5, "calendario"); chk("tipo_contagem inválido é recusado", False)
    except ValueError:
        chk("tipo_contagem inválido é recusado", True)
    chk("'Corridos' (caixa diferente) é aceito", lim(date(2026, 3, 6), 15, "Corridos") == date(2026, 3, 24))
    chk("datetime é aceito", lim(datetime(2026, 4, 2, 9, 30), 5) == date(2026, 4, 13))
    chk("TRT1: prazo que toca 28/10/2026 avisa", any("28/10/2026" in a for a in calcular_prazo(date(2026, 10, 27), 5, tribunal="TRT1")["avisos"]))
except Exception as e:
    chk("cálculos de referência", False, repr(e))
try:
    from core.classifier import classificar_texto
    amostras = [
        "Fica a parte intimada para se manifestar no prazo de 5 (cinco) dias úteis.",
        "Intime-se para cumprimento no prazo de 15 dias corridos.",
        "Publique-se. Nada mais.",
    ]
    for t in amostras:
        c = classificar_texto(t)
        tc = c.get("tipo_contagem")
        chk("classificador: tipo_contagem compatível (%r)" % (tc,), tc in ("uteis", "corridos", None))
        dias = c.get("dias_prazo")
        if dias:
            calcular_prazo(date(2026, 3, 6), dias, tc or "uteis", set(), False, tribunal="TRT1")
            chk("cálculo com a saída real do classificador (%s dias)" % dias, True)
except ImportError as e:
    res.append({"nome": "classificador não importável (verificação ignorada)", "ok": True, "detalhe": repr(e)})
except Exception as e:
    chk("classificador + cálculo", False, repr(e))
print(json.dumps(res))
'''


# ------------------------------------------------------------------ utilitários
class Saida:
    def __init__(self):
        self.linhas: list[str] = []

    def __call__(self, msg: str = ""):
        self.linhas.append(msg)
        print(msg)


def sha256(p: Path) -> str:
    return hashlib.sha256(p.read_bytes()).hexdigest()


def agora() -> str:
    return dt.datetime.now().strftime("%Y%m%d_%H%M%S")


# ------------------------------------------------------------------ verificações
def verificar_origem(origem: Path) -> list[str]:
    erros = []
    for f in ARQUIVOS_CORE:
        if not (origem / "core" / f).is_file():
            erros.append(f"origem sem core/{f}")
    for f in ARQUIVOS_TESTES:
        if not (origem / "tests" / f).is_file():
            erros.append(f"origem sem tests/{f}")
    versao = origem / "VERSAO.json"
    if versao.is_file() and not erros:
        esperado = json.loads(versao.read_text(encoding="utf-8"))
        for rel, h in esperado.items():
            p = origem / rel
            if not p.is_file() or sha256(p) != h:
                erros.append(f"{rel}: SHA-256 diferente do pacote (arquivo corrompido ou alterado)")
    return erros


def verificar_destino(destino: Path, origem: Path) -> list[str]:
    erros = []
    if not destino.is_dir():
        return [f"destino não existe: {destino}"]
    if destino.resolve() == origem.resolve():
        erros.append("destino e origem são a mesma pasta")
    for rel in ("run_daily.py", "core/calendar_prazos.py"):
        if not (destino / rel).is_file():
            erros.append(f"destino sem {rel} (não parece ser a pasta do monitor)")
    return erros


def varrer_chamadas(destino: Path) -> list[str]:
    """Outros arquivos (fora de core/ e tests/) que chamam calcular_prazo()."""
    achados = []
    for raiz, pastas, arquivos in os.walk(destino):
        pastas[:] = [p for p in pastas if p not in IGNORAR_NA_VARREDURA and not p.startswith(PREFIXO_BACKUP)]
        for a in arquivos:
            if a.endswith(".py") and a != "run_daily.py":
                p = Path(raiz) / a
                try:
                    if "calcular_prazo(" in p.read_text(encoding="utf-8", errors="ignore"):
                        achados.append(str(p.relative_to(destino)))
                except OSError:
                    pass
    return sorted(achados)


# ------------------------------------------------------------------ correção do run_daily.py
_RE_LINHA = re.compile(r"(?P<indent>[ \t]*)aplicar_recesso=config\.APLICAR_RECESSO_ART_220,(?P<eol>\r?\n)")


def chamadas_com_tribunal(texto: str) -> tuple[int, int]:
    """(total de chamadas de calcular_prazo, quantas já passam tribunal=)."""
    total = com = 0
    for no in ast.walk(ast.parse(texto.lstrip("\ufeff"))):
        if isinstance(no, ast.Call):
            f = no.func
            nome = f.id if isinstance(f, ast.Name) else f.attr if isinstance(f, ast.Attribute) else None
            if nome == "calcular_prazo":
                total += 1
                com += any(k.arg == "tribunal" for k in no.keywords)
    return total, com


def aplicar_patch(texto: str) -> tuple[str, str]:
    """Devolve (novo_texto, status): aplicado | ja_aplicado | nao_encontrado | ambiguo."""
    total, com = chamadas_com_tribunal(texto)
    if total and com == total:
        return texto, "ja_aplicado"
    achados = list(_RE_LINHA.finditer(texto))
    if len(achados) == 0:
        return texto, "nao_encontrado"
    if len(achados) > 1:
        return texto, "ambiguo"
    m = achados[0]
    inserir = f'{m.group("indent")}tribunal=comunicacao.get("sigla_tribunal"),{m.group("eol")}'
    novo = texto[: m.end()] + inserir + texto[m.end():]
    t2, c2 = chamadas_com_tribunal(novo)  # também garante sintaxe válida
    if t2 == 0 or c2 != t2:
        return texto, "nao_encontrado"
    return novo, "aplicado"


# ------------------------------------------------------------------ backup / restauração
def fazer_backup(destino: Path, relativos: list[str]) -> Path:
    pasta = destino / f"{PREFIXO_BACKUP}{agora()}"
    pasta.mkdir(parents=True, exist_ok=False)
    itens = []
    for rel in relativos:
        p = destino / rel
        existia = p.is_file()
        if existia:
            alvo = pasta / rel
            alvo.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(p, alvo)
        itens.append({"rel": rel.replace("\\", "/"), "existia": existia, "sha256_antes": sha256(p) if existia else None})
    (pasta / "MANIFESTO.json").write_text(
        json.dumps({"criado_em": dt.datetime.now().isoformat(timespec="seconds"), "destino": str(destino), "itens": itens},
                   ensure_ascii=False, indent=2), encoding="utf-8")
    return pasta


def restaurar(pasta_backup: Path, destino: Path | None = None) -> list[str]:
    man = json.loads((pasta_backup / "MANIFESTO.json").read_text(encoding="utf-8"))
    destino = destino or Path(man["destino"])
    feitos = []
    for it in man["itens"]:
        alvo = destino / it["rel"]
        if it["existia"]:
            shutil.copyfile(pasta_backup / it["rel"], alvo)
            if sha256(alvo) != it["sha256_antes"]:
                raise RuntimeError(f"restauração de {it['rel']} não confere com o SHA-256 original")
            feitos.append(f"restaurado {it['rel']}")
        elif alvo.exists():
            alvo.unlink()
            feitos.append(f"removido {it['rel']} (não existia antes)")
    return feitos


# ------------------------------------------------------------------ teste de fumaça
def teste_de_fumaca(destino: Path, usar_pytest: bool, saida: Saida) -> bool:
    env = dict(os.environ, PYTHONDONTWRITEBYTECODE="1", PYTHONIOENCODING="utf-8")
    p = subprocess.run([sys.executable, "-c", SMOKE], cwd=destino, env=env, capture_output=True, text=True, encoding="utf-8")
    ok = p.returncode == 0
    try:
        itens = json.loads(p.stdout.strip().splitlines()[-1])
    except (ValueError, IndexError):
        saida(f"  X o teste de fumaça não devolveu resultado: {p.stderr.strip()[:500] or p.stdout.strip()[:500]}")
        return False
    for it in itens:
        marca = "OK" if it["ok"] else "FALHOU"
        extra = f" -> {it['detalhe']}" if (not it["ok"] and it["detalhe"]) else ""
        saida(f"  [{marca}] {it['nome']}{extra}")
        ok = ok and it["ok"]
    if usar_pytest:
        tem = subprocess.run([sys.executable, "-c", "import pytest"], capture_output=True, cwd=destino).returncode == 0
        if not tem:
            saida("  [aviso] pytest não está instalado neste Python: testes do pacote NÃO executados (pip install pytest).")
        else:
            cmd = [sys.executable, "-m", "pytest", *[f"tests/{t}" for t in ARQUIVOS_TESTES], "-q", "-p", "no:cacheprovider"]
            q = subprocess.run(cmd, cwd=destino, env=env, capture_output=True, text=True, encoding="utf-8")
            resumo = (q.stdout.strip().splitlines() or ["(sem saída)"])[-1]
            saida(f"  [{'OK' if q.returncode == 0 else 'FALHOU'}] testes do pacote: {resumo}")
            if q.returncode != 0:
                saida("\n".join("      " + l for l in q.stdout.strip().splitlines()[-25:]))
                ok = False
    return ok


# ------------------------------------------------------------------ fluxo principal
def reverter(pasta: Path, sim: bool, saida: Saida) -> int:
    if not (pasta / "MANIFESTO.json").is_file():
        saida(f"Não encontrei MANIFESTO.json em {pasta}.")
        return 2
    if not sim and input("Digite SIM para restaurar o backup: ").strip().upper() != "SIM":
        saida("Cancelado.")
        return 2
    for l in restaurar(pasta):
        saida("  " + l)
    saida("Backup restaurado.")
    return 0


def main(argv=None) -> int:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    ap = argparse.ArgumentParser(description="Instala os calendários por tribunal no monitor processual.")
    ap.add_argument("--destino", help="pasta do monitor (onde está o run_daily.py)")
    ap.add_argument("--origem", help="pasta do pacote (padrão: a pasta acima de instalacao/)")
    ap.add_argument("--simular", action="store_true", help="só mostra o plano; não altera nada")
    ap.add_argument("--verificar", action="store_true", help="roda o teste de fumaça no destino atual; não altera nada")
    ap.add_argument("--reverter", metavar="PASTA_BACKUP", help="restaura um backup feito por este instalador")
    ap.add_argument("--sim", action="store_true", help="não pede confirmação")
    ap.add_argument("--sem-pytest", action="store_true", help="pula os testes do pacote no teste de fumaça")
    ap.add_argument("--sem-patch-run-daily", action="store_true",
                    help="instala sem corrigir o run_daily.py (o calendário por tribunal NÃO será usado)")
    a = ap.parse_args(argv)
    saida = Saida()

    if a.reverter:
        return reverter(Path(a.reverter), a.sim, saida)
    if not a.destino:
        ap.error("--destino é obrigatório")
    destino = Path(a.destino).resolve()
    origem = Path(a.origem).resolve() if a.origem else Path(__file__).resolve().parent.parent

    if a.verificar:
        saida(f"Verificando {destino} ...")
        ok = teste_de_fumaca(destino, not a.sem_pytest, saida)
        saida("Resultado: " + ("OK" if ok else "COM FALHAS"))
        return 0 if ok else 1

    erros = verificar_origem(origem) + verificar_destino(destino, origem)
    if erros:
        saida("NADA foi alterado. Problemas encontrados:")
        for e in erros:
            saida("  - " + e)
        return 2

    run_daily = destino / "run_daily.py"
    texto = run_daily.read_bytes().decode("utf-8")
    novo_texto, status = aplicar_patch(texto)
    if a.sem_patch_run_daily:
        status = "pulado"
    if status in ("nao_encontrado", "ambiguo"):
        saida("NADA foi alterado. Não consegui corrigir o run_daily.py automaticamente "
              f"({'trecho não encontrado' if status == 'nao_encontrado' else 'trecho ambíguo'}).")
        saida("Sem essa correção o calendário por tribunal não seria usado. Faça manualmente: na chamada de "
              "calcular_prazo(...) acrescente  tribunal=comunicacao.get(\"sigla_tribunal\"),  e rode de novo com "
              "--sem-patch-run-daily, ou envie o trecho para ajuste.")
        return 2

    relativos = [f"core/{f}" for f in ARQUIVOS_CORE] + [f"tests/{f}" for f in ARQUIVOS_TESTES]
    if not (destino / "core" / "__init__.py").exists():
        relativos.append("core/__init__.py")
    if status == "aplicado":
        relativos.append("run_daily.py")

    identicos = all((destino / r).is_file() and sha256(destino / r) == sha256(origem / r)
                    for r in relativos if r != "run_daily.py" and r != "core/__init__.py")
    if identicos and status in ("ja_aplicado",):
        saida("Já instalado (arquivos idênticos e run_daily.py já corrigido). Rodando só a verificação:")
        ok = teste_de_fumaca(destino, not a.sem_pytest, saida)
        return 0 if ok else 1

    saida("PLANO")
    saida(f"  origem : {origem}")
    saida(f"  destino: {destino}")
    for r in relativos:
        existe = (destino / r).is_file()
        saida(f"  {'substitui' if existe else 'cria     '} {r}")
    descricao_patch = {
        "aplicado": 'recebe tribunal=comunicacao.get("sigla_tribunal") (1 linha)',
        "ja_aplicado": "já corrigido",
        "nao_encontrado": "NÃO será corrigido (--sem-patch-run-daily)",
        "ambiguo": "NÃO será corrigido (--sem-patch-run-daily)",
        "pulado": "NÃO será alterado (--sem-patch-run-daily): o calendário por tribunal não será usado",
    }[status]
    saida("  run_daily.py: " + descricao_patch)
    outras = varrer_chamadas(destino)
    if outras:
        saida("  ATENÇÃO: outros arquivos chamam calcular_prazo() e NÃO serão alterados (usarão o TJRJ por padrão):")
        for o in outras:
            saida(f"    - {o}")
    saida("  Antes de continuar, confirme que NENHUMA execução do monitor está em andamento (a tarefa diária roda de manhã).")
    if a.simular:
        saida("\n--simular: nada foi alterado.")
        return 0
    if not a.sim:
        if not sys.stdin.isatty() or input("\nDigite SIM para instalar: ").strip().upper() != "SIM":
            saida("Cancelado. Nada foi alterado.")
            return 2

    backup = fazer_backup(destino, relativos)
    saida(f"\nBackup criado em: {backup}")
    try:
        (destino / "core").mkdir(exist_ok=True)
        (destino / "tests").mkdir(exist_ok=True)
        if "core/__init__.py" in relativos:
            (destino / "core" / "__init__.py").write_text("", encoding="utf-8")
        for r in relativos:
            if r in ("run_daily.py", "core/__init__.py"):
                continue
            shutil.copyfile(origem / r, destino / r)
        if status == "aplicado":
            run_daily.write_bytes(novo_texto.encode("utf-8"))
            total, com = chamadas_com_tribunal(run_daily.read_bytes().decode("utf-8"))
            if total == 0 or total != com:
                raise RuntimeError("run_daily.py não ficou com tribunal= em todas as chamadas de calcular_prazo")
        saida("Arquivos copiados. Teste de fumaça:")
        ok = teste_de_fumaca(destino, not a.sem_pytest, saida)
    except Exception as exc:  # qualquer erro => desfaz
        saida(f"  X erro durante a instalação: {exc!r}")
        ok = False

    if not ok:
        saida("\nFALHOU. Desfazendo a instalação...")
        for l in restaurar(backup, destino):
            saida("  " + l)
        saida(f"Estado anterior restaurado (conferido por SHA-256). O backup continua em {backup}.")
        (backup / "instalacao.log").write_text("\n".join(saida.linhas), encoding="utf-8")
        return 1

    (backup / "instalacao.log").write_text("\n".join(saida.linhas), encoding="utf-8")
    saida("\nINSTALADO COM SUCESSO.")
    saida(f"Para desfazer depois: python instalacao\\instalar_calendarios.py --reverter \"{backup}\"")
    saida("Reinicie a tarefa 'Painel' (ou o computador) para o painel carregar os módulos novos.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
