"""
Gatilhos, validação e registro da análise AJEAP executada no Claude.

A coleta (DJEN, DataJud, prazos) acontece no computador, no monitor. A ANÁLISE
JURÍDICA (protocolo AJEAP) e a REDAÇÃO DE RASCUNHOS acontecem no Claude, sobre os
documentos do painel Vigia Processual. Este módulo é a regra determinística que
decide QUANDO analisar e CONFERE o que o Claude grava — para que a decisão e o
formato não dependam do humor de um prompt.

Regras que o módulo trava (e por quê):

* GATILHOS: um processo só entra na fila de análise se houver motivo concreto
  (sem análise; andamento/intimação/prazo posterior à última análise; prazo
  próximo sem análise que o cubra; análise antiga com prazo aberto). Sem motivo,
  não se gasta análise nem se reescreve o que já está bom.
* URGÊNCIA PRIMEIRO: a fila é ordenada pelo prazo mais próximo, e tem teto por
  execução (o resto fica para a próxima).
* FORMATO DA ANÁLISE: o bloco `ajeap` precisa trazer os três cenários (favorável,
  mais provável, desfavorável), fontes quando houver precedente citado e a
  ressalva de validação por advogado(a) com OAB. Se faltar informação essencial,
  a análise se limita a `perguntasNecessarias` (o protocolo proíbe forçar
  conclusão).
* RASCUNHOS: toda minuta registrada tem status fixo "RASCUNHO" e título iniciado
  por "RASCUNHO". Nada aqui protocola, assina ou envia coisa alguma.
* HISTÓRICO: ao substituir uma análise, um resumo da anterior vai para
  `ajeapHistorico` (máx. 5) — nada se perde em silêncio.
"""
from __future__ import annotations

import re
from datetime import date, datetime
from typing import Iterable

MOTIVOS_EM_ORDEM = (
    "prazo_em_risco",
    "sem_ajeap",
    "novidade_no_retrato",
    "termo_sensivel_novo",
    "movimento_posterior_a_analise",
    "analise_antiga_com_prazo_aberto",
)
TIPOS_MINUTA = ("manifestacao", "contestacao", "recurso", "embargos", "peticao_simples", "parecer", "outro")
MAX_HISTORICO = 5
MAX_MINUTAS = 20
MAX_TEXTO_MINUTA = 30_000

_RE_PRECEDENTE = re.compile(r"\b(STJ|STF|TST|TRT\s?\d*|TJ[A-Z]{2}|Tema|S[úu]mula|REsp|AREsp|RR-|IRDR|OJ\b)", re.I)
_RE_OAB = re.compile(r"\bOAB\b|advogad[oa]", re.I)


# ------------------------------------------------------------------ datas
def _data(v) -> date | None:
    if v is None or v == "":
        return None
    if isinstance(v, datetime):
        return v.date()
    if isinstance(v, date):
        return v
    s = str(v).strip()
    m = re.match(r"^(\d{4})-(\d{2})-(\d{2})", s)
    if m:
        return date(int(m[1]), int(m[2]), int(m[3]))
    m = re.match(r"^(\d{2})/(\d{2})/(\d{4})", s)
    if m:
        return date(int(m[3]), int(m[2]), int(m[1]))
    return None


def _prazos(doc: dict, retrato: dict | None) -> list[tuple[date, date | None]]:
    """[(data_limite, data_publicacao|None)] de todos os prazos conhecidos."""
    achados = []
    p = doc.get("prazo")
    if isinstance(p, dict) and _data(p.get("dataLimite")):
        achados.append((_data(p["dataLimite"]), _data(p.get("dataPublicacao"))))
    for q in (retrato or {}).get("prazos_abertos") or []:
        lim = _data(q.get("data_limite") or q.get("dataLimite"))
        if lim:
            achados.append((lim, _data(q.get("data_publicacao") or q.get("dataPublicacao"))))
    return achados


def dias_ate_proximo_prazo(doc: dict, retrato: dict | None, hoje: date) -> int | None:
    """Dias corridos até o prazo ABERTO mais próximo (hoje conta como 0); None se não há."""
    abertos = [(lim - hoje).days for lim, _ in _prazos(doc, retrato) if lim >= hoje]
    return min(abertos) if abertos else None


# ------------------------------------------------------------------ gatilhos
def motivos_para_analisar(
    doc: dict,
    retrato: dict | None = None,
    *,
    hoje: date,
    dias_alerta: int = 5,
    dias_revisao: int = 30,
) -> list[str]:
    """Códigos de motivo (em ordem de prioridade) pelos quais o processo deve ser analisado hoje."""
    retrato = retrato or {}
    motivos: set[str] = set()
    tem = bool(doc.get("ajeap"))
    analise_em = _data(doc.get("ajeapAtualizadoEm"))
    prazos = _prazos(doc, retrato)

    if not tem:
        motivos.add("sem_ajeap")

    for lim, pub in prazos:
        if 0 <= (lim - hoje).days <= dias_alerta:
            coberto = analise_em is not None and (pub is None or analise_em >= pub) and (hoje - analise_em).days <= dias_alerta
            if not tem or not coberto:
                motivos.add("prazo_em_risco")

    verificado = _data(retrato.get("verificado_em"))
    if retrato.get("novidade") and (analise_em is None or verificado is None or verificado > analise_em):
        motivos.add("novidade_no_retrato")
        if retrato.get("termos_sensiveis"):
            motivos.add("termo_sensivel_novo")

    if tem and analise_em:
        mov = max(
            [d for d in (
                _data(doc.get("ultimaMovData")),
                _data((doc.get("datajud") or {}).get("ultimoAndamento")),
                _data(retrato.get("ultimo_andamento_data")),
            ) if d] or [None],
            default=None,
        )
        if mov and mov > analise_em:
            motivos.add("movimento_posterior_a_analise")
        if (hoje - analise_em).days > dias_revisao and any(lim >= hoje for lim, _ in prazos):
            motivos.add("analise_antiga_com_prazo_aberto")

    return [m for m in MOTIVOS_EM_ORDEM if m in motivos]


def fila_de_analise(
    docs: Iterable[dict],
    retratos_por_numero: dict | None = None,
    *,
    hoje: date,
    limite: int = 5,
    **kw,
) -> list[dict]:
    """Processos a analisar hoje, o prazo mais próximo primeiro, no máximo `limite`."""
    retratos = retratos_por_numero or {}
    fila = []
    for d in docs:
        r = retratos.get(d.get("numero"))
        mot = motivos_para_analisar(d, r, hoje=hoje, **kw)
        if mot:
            fila.append({
                "id": d.get("id"),
                "numero": d.get("numero"),
                "motivos": mot,
                "dias_ate_prazo": dias_ate_proximo_prazo(d, r, hoje),
            })
    fila.sort(key=lambda x: (
        x["dias_ate_prazo"] if x["dias_ate_prazo"] is not None else 10**6,
        MOTIVOS_EM_ORDEM.index(x["motivos"][0]),
        str(x["numero"]),
    ))
    return fila[:limite]


# ------------------------------------------------------------------ análise
def _lista_de_texto(v) -> bool:
    return isinstance(v, list) and all(isinstance(x, str) and x.strip() for x in v)


def validar_ajeap(a) -> list[str]:
    """Problemas do bloco `ajeap` (lista vazia = válido)."""
    if not isinstance(a, dict):
        return ["ajeap deve ser um objeto"]
    erros = []
    if not str(a.get("resumoCaso") or "").strip():
        erros.append("resumoCaso ausente")
    if not _RE_OAB.search(str(a.get("ressalvaProfissional") or "")):
        erros.append("ressalvaProfissional deve indicar validação por advogado(a) com OAB")

    incompleta = bool(a.get("perguntasNecessarias")) and not a.get("cenarios")
    if a.get("perguntasNecessarias") is not None and not _lista_de_texto(a["perguntasNecessarias"]):
        erros.append("perguntasNecessarias deve ser lista de textos")
    if incompleta:
        return erros  # informação insuficiente: só perguntas (protocolo AJEAP)

    for k in ("baseLegal", "pontosFortes", "pontosFracos"):
        if not a.get(k) or not _lista_de_texto(a[k]):
            erros.append(f"{k} deve ser lista não vazia de textos")
    c = a.get("cenarios")
    if not isinstance(c, dict):
        erros.append("cenarios ausente")
    else:
        for k in ("favoravel", "provavel", "desfavoravel"):
            if not str(c.get(k) or "").strip():
                erros.append(f"cenarios.{k} ausente (os três cenários são obrigatórios)")
    for k in ("vetorTemporal", "estrategiaRecomendada"):
        if not str(a.get(k) or "").strip():
            erros.append(f"{k} ausente")
    plano = a.get("planoAcao")
    if not isinstance(plano, list) or not plano:
        erros.append("planoAcao deve ser lista não vazia")
    else:
        for i, it in enumerate(plano, 1):
            if not (isinstance(it, dict) and str(it.get("passo") or "").strip() and str(it.get("prazo") or "").strip()):
                erros.append(f"planoAcao[{i}] precisa de passo e prazo")
    corpo = " ".join(str(a.get(k) or "") for k in ("baseLegal", "pontosFortes", "pontosFracos", "estrategiaRecomendada"))
    if _RE_PRECEDENTE.search(corpo) and not a.get("fontes"):
        erros.append("precedente citado sem fontes: confirme o julgado e liste a fonte (ou retire a citação)")
    return erros


def aplicar_analise(doc: dict, ajeap: dict, motivos: list[str], *, agora: datetime) -> dict:
    """
    Campos a gravar no documento do painel (use com `update` pinado em `version`).
    Levanta ValueError se o bloco `ajeap` for inválido.
    """
    erros = validar_ajeap(ajeap)
    if erros:
        raise ValueError("análise AJEAP inválida: " + "; ".join(erros))
    hist = list(doc.get("ajeapHistorico") or [])
    anterior = doc.get("ajeap")
    if anterior:
        hist.append({
            "em": doc.get("ajeapAtualizadoEm") or "data desconhecida",
            "gatilhos": list(doc.get("ajeapGatilho") or []),
            "resumo": str(anterior.get("resumoCaso") or "")[:240],
        })
    return {
        "ajeap": ajeap,
        "ajeapAtualizadoEm": agora.replace(microsecond=0).isoformat(),
        "ajeapGatilho": list(motivos),
        "ajeapHistorico": hist[-MAX_HISTORICO:],
    }


# ------------------------------------------------------------------ minutas
def validar_minuta(m) -> list[str]:
    if not isinstance(m, dict):
        return ["minuta deve ser um objeto"]
    erros = []
    if not str(m.get("titulo") or "").upper().startswith("RASCUNHO"):
        erros.append('título deve começar com "RASCUNHO"')
    if m.get("tipo") not in TIPOS_MINUTA:
        erros.append(f"tipo deve ser um de {TIPOS_MINUTA}")
    if not str(m.get("link") or "").startswith("https://"):
        erros.append("link deve ser https://")
    if m.get("status") != "RASCUNHO":
        erros.append('status deve ser exatamente "RASCUNHO" (o sistema nunca protocola nem assina)')
    texto = m.get("texto")
    if texto is not None:
        if not isinstance(texto, str) or "NÃO PROTOCOLAR" not in texto[:300].upper().replace("NAO PROTOCOLAR", "NÃO PROTOCOLAR"):
            erros.append('texto deve começar com o cabeçalho "RASCUNHO — NÃO PROTOCOLAR"')
        if isinstance(texto, str) and len(texto) > MAX_TEXTO_MINUTA:
            erros.append(f"texto excede {MAX_TEXTO_MINUTA} caracteres")
    return erros


def registrar_minuta(
    doc: dict,
    *,
    titulo: str,
    tipo: str,
    link: str,
    agora: datetime,
    prazo_relacionado: str | None = None,
    texto: str | None = None,
) -> dict:
    """
    Campo `minutas` atualizado (acrescenta; nunca remove nem altera status).
    `texto` (Markdown) é o plano B quando não há Claude Docs: o rascunho fica no
    próprio documento do painel e `link` aponta para o painel.
    """
    nova = {
        "titulo": titulo,
        "tipo": tipo,
        "link": link,
        "status": "RASCUNHO",
        "geradoEm": agora.replace(microsecond=0).isoformat(),
        "prazoRelacionado": prazo_relacionado,
    }
    if texto is not None:
        nova["texto"] = texto
    erros = validar_minuta(nova)
    if erros:
        raise ValueError("minuta inválida: " + "; ".join(erros))
    atuais = list(doc.get("minutas") or [])
    if any(x.get("link") == link for x in atuais):
        return {"minutas": atuais}
    return {"minutas": (atuais + [nova])[-MAX_MINUTAS:]}


# ------------------------------------------------------------------ pacote
def montar_pacote_analise(
    doc: dict,
    retrato: dict | None = None,
    comunicacoes: Iterable[dict] = (),
    *,
    motivos: list[str],
    max_texto: int = 1500,
    max_eventos: int = 8,
) -> dict:
    """
    Entrada mínima para o Claude (minimização de dados, LGPD): só o que a análise
    precisa. Textos de intimação são truncados; nada de campos soltos do banco.
    """
    retrato = retrato or {}
    return {
        "numero": doc.get("numero"),
        "tribunal": doc.get("tribunal"),
        "tipo": doc.get("tipo"),
        "partes": {"autor": doc.get("autor"), "reu": doc.get("reu")},
        "faseProvavel": doc.get("faseProvavel"),
        "motivosDaAnalise": list(motivos),
        "eventosRecentes": list(doc.get("eventos") or [])[:max_eventos],
        "ultimaMovimentacao": {"data": doc.get("ultimaMovData"), "resumo": doc.get("ultimaMovResumo")},
        "termosSensiveis": list(retrato.get("termos_sensiveis") or []),
        "prazos": [
            {"dataLimite": lim.isoformat(), "dataPublicacao": pub.isoformat() if pub else None}
            for lim, pub in _prazos(doc, retrato)
        ],
        "avisosDoCalculoDePrazo": list((doc.get("prazo") or {}).get("avisos") or []),
        "intimacoes": [
            {"data": c.get("data_disponibilizacao") or c.get("data"), "texto": str(c.get("texto") or "")[:max_texto]}
            for c in comunicacoes
        ],
        "analiseAnterior": {
            "atualizadaEm": doc.get("ajeapAtualizadoEm"),
            "resumoCaso": str((doc.get("ajeap") or {}).get("resumoCaso") or "")[:500] or None,
        },
    }
