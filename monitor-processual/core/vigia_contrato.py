"""
Contrato de dados do painel "Vigia Processual" e ponte com o monitor.

O painel (artefato do claude.ai) guarda um documento por processo na coleção
`processos`. Este módulo é a ÚNICA definição desse formato no lado do monitor:
o monitor passa a gerar os documentos por aqui, e o programa local
"VigiaProcessual" deixa de ser necessário (ele só consultava DataJud/DJEN, o
que `clients/datajud_client.py` e `clients/djen_client.py` já fazem).

Decisões que este módulo trava:

* CHAVE ESTÁVEL: o id do documento é derivado do número CNJ
  (`cnj_<20 dígitos>`). Com isso gravar duas vezes o mesmo processo SOBRESCREVE
  em vez de duplicar. Antes, o formulário do painel usava `p_<Date.now()>` e
  um duplo envio criou três documentos do mesmo processo.
* NÚMERO VÁLIDO: o número é normalizado e o dígito verificador é conferido
  (Res. CNJ 65/2008: os 20 dígitos, lidos como inteiro, dão resto 1 na
  divisão por 97). Número inválido nunca vira documento.
* PRAZO CALCULADO: o bloco `prazo` vem de `calendar_prazos.calcular_prazo`
  (calendário do tribunal do processo, com os avisos), em vez do texto livre "prazo em
  verificação".
* AUDITORIA: `auditar` aponta duplicados, ids fora do padrão, campos
  ausentes, DataJud ausente/desatualizado e o campo reservado `version`
  dentro do documento.

Este arquivo NÃO grava no painel: o banco do artefato só é acessível de dentro
do Claude. A rotina diária lê o JSON produzido por `montar_documento` e grava
em `processos/<id>`.
"""
from __future__ import annotations

import re
from datetime import date, datetime
from typing import Iterable

from . import calendar_prazos as _prazos
from . import calendarios as _perfis

_RE_CNJ = re.compile(r"^(\d{7})-(\d{2})\.(\d{4})\.(\d)\.(\d{2})\.(\d{4})$")

ORIGENS = ("Automático", "E-mail", "Manual")

# campo -> valor padrão quando o monitor não informa
CAMPOS_BASE: dict = {
    "tribunal": "—",
    "autor": "—",
    "reu": "—",
    "tipo": "Outro",
    "origem": "Automático",
    "ajuizamento": "—",
    "faseProvavel": "—",
    "ultimaMovData": "",
    "ultimaMovResumo": "",
    "urgente": False,
    "urgenteDescricao": "",
    "dadosParciais": True,
    "ajeap": None,
}
CAMPOS_OPCIONAIS = (
    "nomeLocal", "sincronizadoEm", "datajud", "eventos",
    "linkConsulta", "observacaoDataJud", "prazo",
)
# `version` é metadado do banco do painel; dentro do documento colide com ele
CAMPOS_RESERVADOS = ("version",)


# --------------------------------------------------------------- número CNJ
def _digitos(valor) -> str:
    return re.sub(r"\D", "", str(valor or ""))


def dv_valido(numero_formatado: str) -> bool:
    m = _RE_CNJ.match(numero_formatado or "")
    if not m:
        return False
    n, dd, ano, j, tr, orig = m.groups()
    return int(n + ano + j + tr + orig + dd) % 97 == 1


def normalizar_numero(valor) -> str | None:
    """'NNNNNNN-DD.AAAA.J.TR.OOOO' se `valor` tiver 20 dígitos e DV correto; senão None."""
    d = _digitos(valor)
    if len(d) != 20:
        return None
    fmt = f"{d[0:7]}-{d[7:9]}.{d[9:13]}.{d[13]}.{d[14:16]}.{d[16:20]}"
    return fmt if dv_valido(fmt) else None


def id_documento(numero) -> str:
    n = normalizar_numero(numero)
    if n is None:
        raise ValueError(f"número CNJ inválido: {numero!r}")
    return "cnj_" + _digitos(n)


def tribunal_curto(numero) -> str:
    """Mesma regra do painel: TRT1, TJSP, TJRJ ou '—'."""
    n = normalizar_numero(numero)
    if n is None:
        return "—"
    j, tr = _RE_CNJ.match(n).group(4, 5)
    return {("5", "01"): "TRT1", ("8", "26"): "TJSP", ("8", "19"): "TJRJ"}.get((j, tr), "—")


# ------------------------------------------------------------------- prazo
def sigla_do_numero(numero) -> str | None:
    """Sigla do tribunal deduzida do número CNJ ('TRT1', 'TJRJ', 'TJSP') ou None."""
    t = tribunal_curto(numero)
    return None if t == "—" else t


def montar_prazo(
    data_disponibilizacao: date,
    dias: int,
    tipo_contagem: str = "uteis",
    *,
    tribunal: str | None = None,
    capital: bool = False,
    aplicar_recesso: bool = False,
    feriados_extras: set[date] | None = None,
    agora: datetime | None = None,
) -> dict:
    """
    Bloco `prazo` do documento (datas em ISO). `tribunal` (sigla do DJEN ou
    `sigla_do_numero`) escolhe o calendário; sem ele vale o padrão (TJRJ).
    """
    r = _prazos.calcular_prazo(
        data_disponibilizacao, dias, tipo_contagem, feriados_extras, aplicar_recesso, capital, tribunal
    )
    nome, perfil, reserva = _perfis.resolver(tribunal)
    ref = getattr(perfil, "ATUALIZADO_EM", None)
    rotulo = nome if not reserva else f"{nome} (calendário nacional de reserva)"
    if ref and not reserva:
        rotulo += f" (base de {ref:%d/%m/%Y})"
    return {
        "dataDisponibilizacao": r["data_disponibilizacao"].isoformat(),
        "dataPublicacao": r["data_publicacao"].isoformat(),
        "dataInicio": r["data_inicio_prazo"].isoformat(),
        "dataLimite": r["data_limite"].isoformat(),
        "dias": r["dias"],
        "tipoContagem": r["tipo_contagem"],
        "capital": bool(capital),
        "recessoAplicado": bool(aplicar_recesso),
        "avisos": list(r["avisos"]),
        "calendario": rotulo,
        "calculadoEm": (agora or datetime.now()).replace(microsecond=0).isoformat(),
    }


# --------------------------------------------------------------- documento
def montar_documento(
    proc: dict,
    *,
    mapa: dict[str, str] | None = None,
    prazo: dict | None = None,
    agora: datetime | None = None,
) -> dict:
    """
    Converte um processo do monitor no documento do painel. Não altera `proc`.

    `mapa` renomeia chaves do monitor para as do painel (ex.: {"cnj": "numero"}).
    Levanta ValueError se o número CNJ for inválido.
    """
    src = dict(proc)
    for de, para in (mapa or {}).items():
        if de in src and para not in src:
            src[para] = src.pop(de)
    numero = normalizar_numero(src.get("numero"))
    if numero is None:
        raise ValueError(f"número CNJ inválido: {src.get('numero')!r}")

    doc = {k: src[k] for k in (*CAMPOS_BASE, *CAMPOS_OPCIONAIS) if k in src}
    for k, padrao in CAMPOS_BASE.items():
        if doc.get(k) is None and k != "ajeap":
            doc[k] = padrao
        doc.setdefault(k, padrao)
    if doc["origem"] not in ORIGENS:
        doc["origem"] = "Automático"
    doc["numero"] = numero
    doc["id"] = id_documento(numero)
    if prazo is not None:
        doc["prazo"] = prazo
    doc.setdefault("sincronizadoEm", (agora or datetime.now()).replace(microsecond=0).isoformat())
    for k in CAMPOS_RESERVADOS:
        doc.pop(k, None)
    return doc


# ---------------------------------------------------------------- qualidade
def _preenchido(v) -> bool:
    return v not in (None, "", "—", [], {}, False)


def completude(doc: dict) -> int:
    pontos = sum(1 for k in (*CAMPOS_BASE, *CAMPOS_OPCIONAIS) if _preenchido(doc.get(k)))
    a = doc.get("ajeap") or {}
    if _preenchido(a.get("resumoCaso")) and not str(a["resumoCaso"]).startswith("Registro duplicado"):
        pontos += 5
    if doc.get("datajud"):
        pontos += 3
    pontos += 2 * min(len(doc.get("eventos") or []), 5)
    return pontos


def deduplicar(docs: Iterable[dict]) -> tuple[list[dict], list[dict]]:
    """
    Um documento por número CNJ: fica o mais completo (desempate: sincronização
    mais recente, depois id). Documentos de número inválido passam adiante
    sem serem comparados (a `auditar` os acusa).
    """
    grupos: dict[str, list[dict]] = {}
    sem_chave: list[dict] = []
    for d in docs:
        n = normalizar_numero(d.get("numero"))
        (grupos.setdefault(n, []) if n else sem_chave).append(d)
    unicos, descartados = [], []
    for membros in grupos.values():
        membros = sorted(
            membros,
            key=lambda d: (completude(d), str(d.get("sincronizadoEm") or ""), str(d.get("id") or "")),
            reverse=True,
        )
        unicos.append(membros[0])
        descartados.extend(membros[1:])
    return unicos + sem_chave, descartados


def auditar(docs: Iterable[dict], *, agora: datetime | None = None, max_dias_datajud: int = 7) -> list[dict]:
    """Lista de problemas {id, tipo, detalhe}; vazia = coleção saudável."""
    agora = agora or datetime.now()
    docs = list(docs)
    problemas: list[dict] = []

    def add(d, tipo, detalhe):
        problemas.append({"id": d.get("id"), "tipo": tipo, "detalhe": detalhe})

    vistos: dict[str, str] = {}
    for d in docs:
        n = normalizar_numero(d.get("numero"))
        if n is None:
            add(d, "numero_invalido", f"{d.get('numero')!r}")
            continue
        if n in vistos:
            add(d, "duplicado", f"mesmo número do documento {vistos[n]}")
        else:
            vistos[n] = d.get("id")
        if d.get("id") != id_documento(n):
            add(d, "id_fora_do_padrao", f"esperado {id_documento(n)}")
        for k in CAMPOS_BASE:
            if k not in d:
                add(d, "campo_ausente", k)
        for k in CAMPOS_RESERVADOS:
            if k in d:
                add(d, "campo_reservado", f"'{k}' dentro do documento colide com o metadado do banco")
        dj = d.get("datajud")
        if not dj:
            add(d, "datajud_ausente", "nunca verificado no DataJud")
        else:
            try:
                ver = datetime.fromisoformat(str(dj.get("ultimaVerificacao")))
            except ValueError:
                add(d, "datajud_ausente", "ultimaVerificacao ausente ou inválida")
            else:
                idade = (agora - ver).days
                if idade > max_dias_datajud:
                    add(d, "datajud_desatualizado", f"última verificação há {idade} dias")
            # frescor da FONTE (quando o próprio DataJud atualizou), distinto da data da nossa coleta
            try:
                fonte = datetime.fromisoformat(str(dj.get("atualizadoEm"))[:19]) if dj.get("atualizadoEm") else None
            except ValueError:
                fonte = None
            if fonte is not None and (agora - fonte).days > max_dias_datajud:
                add(d, "datajud_fonte_atrasada", f"DataJud sem atualizar há {(agora - fonte).days} dias")
    return problemas
