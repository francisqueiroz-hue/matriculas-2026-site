"""
Calculadora de datas de prazo processual.

=============================================================================
MUDANÇA CRÍTICA NA v5 — LEIA
=============================================================================
Até a v2, TODO prazo calculado saía 1 DIA ÚTIL A MAIS do que o correto,
sempre na direção perigosa (o app dizia que havia mais tempo do que havia).

A causa: `somar_dias_uteis` contava N dias úteis *a partir de, sem contar*,
o dia de início. Mas o primeiro dia útil seguinte ao da publicação
(CPC art. 224, §3º) É o 1º dia do prazo, não o dia zero.

Exemplo de conferência (caso com datas fechadas):
    publicação .......... 10/09/2018 (segunda)
    1º dia do prazo ..... 11/09/2018 (terça)
    prazo de 15 dias úteis vence em 01/10/2018
    (a v2 devolvia 02/10/2018)

Base legal:
  art. 224, caput — exclui o dia do começo, inclui o do vencimento
  art. 224, §2º   — publicação = 1º dia útil seguinte à disponibilização
  art. 224, §3º   — contagem tem início no 1º dia útil seguinte à publicação
  art. 219        — prazos processuais em dias úteis (processo civil)
=============================================================================

CALENDÁRIO (v6.2): os dias não úteis vêm de core/calendario_tjrj.py — feriados
legais do art. 83 da Lei estadual 10.633/2024 e atos do TJRJ de 2026, com a
base normativa de cada data. A biblioteca `holidays` deixou de ser usada (a
categoria OPTIONAL dela tratava 28/10, 24/12 e 31/12 como não úteis e ignorava
Quinta-feira Santa, São Jorge e Dia da Justiça).

REVISÃO DE AUDITORIA (versão corrigida):
  * tipo_contagem desconhecido agora levanta ValueError (antes virava dias
    úteis em silêncio);
  * dias corridos agora respeitam aplicar_recesso (antes o parâmetro era
    ignorado e o aviso do art. 220 sumia);
  * entradas `datetime` são normalizadas para `date` (antes os feriados não
    eram reconhecidos).
  Base legal da regra do DJe: Lei 11.419/2006, art. 4º, §§ 3º e 4º.

O QUE ESTA CALCULADORA NÃO FAZ (e por isso continua sendo apoio, não decisão):

1. Feriados e atos de UMA comarca específica (aniversário de comarca, fórum
   regional etc.) — cadastre em config.FERIADOS_FORENSES_EXTRAS. A Capital
   tem calendário próprio: use `capital=True`.
2. A escolha entre dias úteis e dias corridos, que varia por ramo de
   Justiça e tipo de prazo. As duas contagens estão implementadas; a
   escolha é explícita por comunicação.
3. Suspensão do recesso (art. 220) — ver abaixo.

SOBRE O RECESSO DO ART. 220 (20/12 a 20/01):
Por padrão, a calculadora NÃO aplica a suspensão. Isso é deliberado: não
aplicar produz uma data de vencimento MAIS CEDO que a real, e errar para
mais cedo é seguro (você peticiona antes); aplicar e errar produziria uma
data mais tarde que a real, que é exatamente o erro que mata prazo.
Todo prazo que atravessa a faixa 20/12–20/01 é marcado com um aviso para
conferência manual. Se quiser a contagem com a suspensão, ligue
APLICAR_RECESSO_ART_220=true no .env — e confira caso a caso.
"""
from __future__ import annotations

import unicodedata
from datetime import date, datetime, timedelta

from . import calendario_tjrj as _cal

_DIAS_NAO_UTEIS_CACHE: dict[int, frozenset] = {}


def _como_data(d):
    """
    `datetime` é subclasse de `date`, mas NÃO é igual a ele nem tem o mesmo
    hash: `datetime(2026, 4, 3, 10, 0)` nunca casaria com o `date(2026, 4, 3)`
    do conjunto de feriados, e a Sexta-feira Santa viraria dia útil.
    Por isso toda entrada pública é normalizada para `date`.
    """
    return d.date() if isinstance(d, datetime) else d


def _normalizar_tipo_contagem(tipo) -> str:
    """
    Aceita "uteis"/"úteis" e "corridos" (qualquer caixa, com ou sem acento).
    Qualquer outro valor é erro: antes, tudo que não fosse exatamente
    "corridos" era contado, em silêncio, como dias úteis — e "Corridos"
    produzia um vencimento MAIS TARDE do que o real.
    """
    if isinstance(tipo, str):
        t = unicodedata.normalize("NFKD", tipo).encode("ascii", "ignore").decode()
        t = t.strip().lower()
        if t in ("uteis", "corridos"):
            return t
    raise ValueError(
        f"tipo_contagem inválido: {tipo!r}. Use 'uteis' ou 'corridos'."
    )


def _dias_sem_expediente(ano: int) -> frozenset:
    """
    Dias não úteis do TJRJ em `ano` (feriados legais + atos estaduais).
    Ver core/calendario_tjrj.py — não depende da biblioteca `holidays`.
    """
    if ano not in _DIAS_NAO_UTEIS_CACHE:
        _DIAS_NAO_UTEIS_CACHE[ano] = frozenset(_cal.dias_nao_uteis(ano))
    return _DIAS_NAO_UTEIS_CACHE[ano]


# compatibilidade com código que importava o nome antigo
_feriados_nacionais = _dias_sem_expediente


def dentro_do_recesso(d: date) -> bool:
    """CPC art. 220: faixa de 20 de dezembro a 20 de janeiro, inclusive."""
    return (d.month == 12 and d.day >= 20) or (d.month == 1 and d.day <= 20)


def eh_dia_util(
    d: date,
    feriados_extras: set[date] | None = None,
    aplicar_recesso: bool = False,
) -> bool:
    d = _como_data(d)
    if d.weekday() >= 5:  # sábado=5, domingo=6
        return False
    if d in _dias_sem_expediente(d.year):
        return False
    if feriados_extras and d in feriados_extras:
        return False
    if aplicar_recesso and dentro_do_recesso(d):
        return False
    return True


def proximo_dia_util(d: date, feriados_extras: set[date] | None = None) -> date:
    """Se `d` já é dia útil devolve `d`; senão avança até o próximo dia útil."""
    cursor = _como_data(d)
    for _ in range(400):  # guarda contra laço infinito por config absurda
        if eh_dia_util(cursor, feriados_extras):
            return cursor
        cursor += timedelta(days=1)
    raise ValueError(
        "Não foi possível encontrar um dia útil em 400 dias — confira "
        "FERIADOS_FORENSES_EXTRAS no .env, provavelmente há datas demais."
    )


def primeiro_dia_util_seguinte(d: date, feriados_extras: set[date] | None = None) -> date:
    """Avança pelo menos um dia e depois empurra até o próximo dia útil."""
    return proximo_dia_util(_como_data(d) + timedelta(days=1), feriados_extras)


def data_publicacao(data_disponibilizacao: date, feriados_extras: set[date] | None = None) -> date:
    """CPC art. 224, §2º."""
    return primeiro_dia_util_seguinte(data_disponibilizacao, feriados_extras)


def data_inicio_prazo(data_pub: date, feriados_extras: set[date] | None = None) -> date:
    """
    CPC art. 224, §3º. ATENÇÃO: a data devolvida É o 1º dia do prazo —
    ela CONTA na contagem (ver `somar_dias_uteis`).
    """
    return primeiro_dia_util_seguinte(data_pub, feriados_extras)


def somar_dias_uteis(
    inicio: date,
    n_dias: int,
    feriados_extras: set[date] | None = None,
    aplicar_recesso: bool = False,
) -> date:
    """
    Devolve a data do N-ésimo dia útil CONTANDO `inicio` como o 1º dia.

    somar_dias_uteis(x, 1) == x, quando x é dia útil.
    """
    if n_dias < 1:
        raise ValueError("n_dias deve ser >= 1")
    cursor = proximo_dia_util(inicio, feriados_extras)
    if aplicar_recesso:
        while dentro_do_recesso(cursor) or not eh_dia_util(cursor, feriados_extras, True):
            cursor += timedelta(days=1)
    restantes = n_dias - 1
    limite = 0
    while restantes > 0:
        cursor += timedelta(days=1)
        limite += 1
        if limite > 4000:  # pragma: no cover
            raise ValueError("Contagem de dias úteis não convergiu.")
        if eh_dia_util(cursor, feriados_extras, aplicar_recesso):
            restantes -= 1
    return cursor


def somar_dias_corridos(
    inicio: date,
    n_dias: int,
    feriados_extras: set[date] | None = None,
    aplicar_recesso: bool = False,
) -> date:
    """
    N-ésimo dia corrido CONTANDO `inicio` como o 1º dia. Se o vencimento
    cair em dia não útil, prorroga para o próximo dia útil (art. 224, §1º).

    Com `aplicar_recesso=True` os dias de 20/12 a 20/01 (art. 220) NÃO contam,
    e a prorrogação também nunca para dentro da faixa suspensa.
    """
    if n_dias < 1:
        raise ValueError("n_dias deve ser >= 1")
    inicio = _como_data(inicio)
    if aplicar_recesso:
        cursor = inicio - timedelta(days=1)
        restantes = n_dias
        while restantes > 0:
            cursor += timedelta(days=1)
            if not dentro_do_recesso(cursor):
                restantes -= 1
    else:
        cursor = inicio + timedelta(days=n_dias - 1)
    for _ in range(400):  # guarda contra laço infinito por config absurda
        if eh_dia_util(cursor, feriados_extras, aplicar_recesso):
            return cursor
        cursor += timedelta(days=1)
    raise ValueError(
        "Não foi possível encontrar um dia útil em 400 dias — confira "
        "FERIADOS_FORENSES_EXTRAS no .env, provavelmente há datas demais."
    )


def calcular_prazo(
    data_disponibilizacao: date,
    dias: int,
    tipo_contagem: str = "uteis",
    feriados_extras: set[date] | None = None,
    aplicar_recesso: bool = False,
    capital: bool = False,
) -> dict:
    """
    Pipeline completo: disponibilização -> publicação -> 1º dia -> vencimento.

    `capital=True` acrescenta o que vale só na Comarca da Capital (feriado de
    São Sebastião e atos da Capital). O padrão é False: errar para "interior"
    produz data mais CEDO (seguro); errar para "capital" produziria data mais
    tarde. Atos de uma comarca específica vão em `feriados_extras`.

    Devolve também `avisos`: textos que o painel mostra junto do prazo:
      * cruzamento do recesso do art. 220;
      * ano sem pontos facultativos/atos cadastrados (só feriados legais);
      * publicação/início que passou por dia de expediente reduzido.
    """
    tipo_contagem = _normalizar_tipo_contagem(tipo_contagem)
    data_disponibilizacao = _como_data(data_disponibilizacao)
    extras = set(feriados_extras or ())
    if capital:
        ano0 = data_disponibilizacao.year
        extras |= _cal.extras_capital(range(ano0, ano0 + 6))
    extras = extras or None

    pub = data_publicacao(data_disponibilizacao, extras)
    inicio = data_inicio_prazo(pub, extras)

    if tipo_contagem == "corridos":
        vencimento = somar_dias_corridos(inicio, dias, extras, aplicar_recesso)
    else:
        vencimento = somar_dias_uteis(inicio, dias, extras, aplicar_recesso)

    avisos = []
    if _cruza_recesso(inicio, vencimento) and not aplicar_recesso:
        avisos.append(
            "Este prazo atravessa a faixa de 20/12 a 20/01. Se a suspensão do "
            "art. 220 do CPC se aplicar ao seu caso, o vencimento real é MAIS "
            "TARDE do que o calculado aqui. Confira antes de protocolar."
        )

    sem_atos = _cal.anos_sem_atos(range(data_disponibilizacao.year, vencimento.year + 1))
    if sem_atos:
        avisos.append(
            "Calendário do TJRJ sem pontos facultativos/atos cadastrados para "
            + ", ".join(str(a) for a in sem_atos)
            + ": só os feriados legais foram considerados. Confira o informativo "
            "de suspensão de prazos do TJRJ antes de protocolar."
        )

    cursor = data_disponibilizacao + timedelta(days=1)
    while cursor <= inicio:
        if _cal.eh_expediente_reduzido(cursor, capital):
            avisos.append(
                f"{cursor:%d/%m/%Y} teve expediente reduzido com prazos suspensos "
                "e foi tratado como dia NÃO útil para publicação e início do prazo. "
                "Se o seu caso o tratar como dia útil para a publicação, a data "
                "mudaria: confira o ato do TJRJ."
            )
            break
        cursor += timedelta(days=1)

    return {
        "data_disponibilizacao": data_disponibilizacao,
        "data_publicacao": pub,
        "data_inicio_prazo": inicio,
        "dias": dias,
        "tipo_contagem": tipo_contagem,
        "data_limite": vencimento,
        "avisos": avisos,
    }


def _cruza_recesso(inicio: date, fim: date) -> bool:
    cursor = inicio
    while cursor <= fim:
        if dentro_do_recesso(cursor):
            return True
        cursor += timedelta(days=1)
    return False


def dias_ate(data_limite: date, referencia: date | None = None) -> int:
    referencia = _como_data(referencia or date.today())
    return (_como_data(data_limite) - referencia).days


def dias_uteis_ate(
    data_limite: date,
    referencia: date | None = None,
    feriados_extras: set[date] | None = None,
) -> int:
    """
    Dias úteis restantes (o próprio dia de hoje conta, se for útil). É o
    número que realmente importa para decidir se dá tempo de peticionar.
    Negativo quando já venceu.
    """
    referencia = _como_data(referencia or date.today())
    data_limite = _como_data(data_limite)
    if data_limite < referencia:
        return -_contar_uteis(data_limite, referencia, feriados_extras)
    return _contar_uteis(referencia, data_limite, feriados_extras)


def _contar_uteis(inicio: date, fim: date, feriados_extras: set[date] | None) -> int:
    total, cursor = 0, inicio
    while cursor <= fim:
        if eh_dia_util(cursor, feriados_extras):
            total += 1
        cursor += timedelta(days=1)
    return total
