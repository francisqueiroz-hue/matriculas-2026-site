"""
Calendário forense do TRT da 1ª Região (Rio de Janeiro) — dias sem expediente.

=============================================================================
FONTE (texto lido em 13/10/2026)
=============================================================================
ATO nº 109/2025 do Presidente do TRT1 (Rio de Janeiro, 06/10/2025;
disponibilizado em 07/10/2025 no DEJT, Caderno Administrativo): "dispõe sobre
os dias em que não haverá expediente nos órgãos da Justiça do Trabalho da 1ª
Região, no ano de 2026".

  Art. 1º  Divulga a relação dos feriados de 2026 (tabela abaixo reproduzida em
           `_AJUSTES[2026]` e nas regras): dias em que NÃO há expediente.
  Art. 2º  Em 20/04, 05/06, 10/08 e 07/12/2026 o trabalho é à distância, com
           suspensão do atendimento presencial e "dos prazos dos processos
           eletrônicos migrados que dependam de volumes físicos e que possam
           ser afetados". Os demais processos eletrônicos (PJe nativo) NÃO têm
           o prazo suspenso: por isso esses 4 dias ficam como dias ÚTEIS aqui,
           com aviso (ver `ressalvas`).
  Art. 3º  Os órgãos observam também os feriados locais (município/fórum):
           cadastre em FERIADOS_FORENSES_EXTRAS.

Tabela do Art. 1º (2026): 01/01; 02 a 06/01 recesso; 16 a 18/02 Carnaval; 01 a
03/04 Semana Santa; 21/04 Tiradentes; 23/04 São Jorge; 01/05; 04/06 Corpus
Christi; 11/08 Instituição dos Cursos Jurídicos; 07/09; 12/10; 28/10 Dia do
Servidor Público (confirmado pelo usuário; a tabela traz 30/10); 02/11 Finados; 20/11 Consciência Negra; 08/12 Dia da Justiça;
20 a 31/12 recesso. Bases: Leis 662/1949, 5.010/1966 (art. 62), 5.198/2008
(estadual), 6.802/1980, 8.112/1990, 9.093/1995 e 14.759/2023.

=============================================================================
INCONSISTÊNCIA DO PRÓPRIO ATO — Dia do Servidor Público
=============================================================================
Os "considerandos" falam do feriado de 28/10/2026 (quarta-feira); a TABELA do
art. 1º lista 30/10 (sexta-feira). Decisão do usuário (13/10/2026): vale 28/10.
Este módulo trata 28/10 como NÃO útil e 30/10 como útil, e emite aviso sempre que
o prazo toca 28/10 ou 30/10 (conferir no calendário do TRT1 / retificação).

=============================================================================
O QUE ESTE MÓDULO NÃO COBRE
=============================================================================
* Feriados locais (art. 3º): em `capital=True` entra só 20/01 (São Sebastião,
  município do Rio). Niterói, São Gonçalo etc.: use feriados_extras.
* Recesso do art. 220 do CPC (até 20/01): a aplicação ao processo do trabalho
  não foi verificada aqui; o recesso de 20/12 a 06/01 já é feriado (Lei 5.010).
  Os dias 07 a 20/01 só são suspensos com `aplicar_recesso=True`.
* Anos diferentes de 2026: as REGRAS (Lei 5.010 + Ato 109/2025) são replicadas,
  mas sem o ato do ano; `calcular_prazo` emite aviso.
"""
from __future__ import annotations

from datetime import date, timedelta
from typing import Iterable

from .calendario_tjrj import pascoa

NOME = "TRT1"
ATUALIZADO_EM = date(2025, 10, 6)  # data do Ato nº 109/2025
ANOS_COM_ATOS = frozenset({2026})

_FIXOS = (
    (1, 1, "Confraternização Universal (Lei 662/1949)"),
    (4, 21, "Tiradentes (Lei 662/1949)"),
    (5, 1, "Dia do Trabalho (Lei 662/1949)"),
    (8, 11, "Instituição dos Cursos Jurídicos (Lei 5.010/1966)"),
    (9, 7, "Independência do Brasil (Lei 662/1949)"),
    (10, 12, "Nossa Senhora Aparecida (Lei 6.802/1980)"),
    (11, 1, "Todos os Santos (Lei 5.010/1966, art. 62, IV)"),
    (11, 2, "Finados (Lei 662/1949)"),
    (11, 15, "Proclamação da República (Lei 662/1949)"),
    (12, 8, "Dia da Justiça (Lei 5.010/1966)"),
    (12, 25, "Natal (Lei 662/1949)"),
)

# Ajustes do Ato do ano: o que a tabela traz e as regras gerais não derivam.
_AJUSTES: dict[int, dict[date, str]] = {
    2026: {date(2026, 10, 28): "Dia do Servidor Público (considerandos do Ato 109/2025; Lei 8.112/1990)"},
}

_CAPITAL_FIXOS = ((1, 20, "São Sebastião (município do Rio de Janeiro)"),)


def feriados(ano: int) -> dict[date, str]:
    """Todos os dias sem expediente do TRT1 no ano (inclui fins de semana)."""
    p = pascoa(ano)
    r: dict[date, str] = {date(ano, m, d): motivo for m, d, motivo in _FIXOS}
    r[date(ano, 4, 23)] = "São Jorge (Lei estadual 5.198/2008)"
    if ano >= 2024:
        r[date(ano, 11, 20)] = "Consciência Negra (Lei 14.759/2023)"
    r[p - timedelta(days=48)] = "Carnaval (segunda-feira)"
    r[p - timedelta(days=47)] = "Carnaval (terça-feira)"
    r[p - timedelta(days=46)] = "Carnaval (quarta-feira de Cinzas)"
    r[p - timedelta(days=4)] = "Semana Santa (quarta-feira)"
    r[p - timedelta(days=3)] = "Semana Santa (quinta-feira)"
    r[p - timedelta(days=2)] = "Semana Santa (sexta-feira)"
    r[p + timedelta(days=60)] = "Corpus Christi (Lei 9.093/1995)"
    # recesso forense: 20/12 a 06/01 (Lei 5.010/1966, art. 62, I)
    for dia in range(1, 7):
        r[date(ano, 1, dia)] = "Recesso forense (Lei 5.010/1966)"
    for dia in range(20, 32):
        r[date(ano, 12, dia)] = "Recesso forense (Lei 5.010/1966)"
    for d, motivo in _AJUSTES.get(ano, {}).items():
        r[d] = motivo
    return r


_CACHE: dict[int, dict[date, str]] = {}


def dias_nao_uteis(ano: int) -> dict[date, str]:
    if ano not in _CACHE:
        _CACHE[ano] = feriados(ano)
    return _CACHE[ano]


def dias_nao_uteis_capital(ano: int) -> dict[date, str]:
    return {date(ano, m, d): motivo for m, d, motivo in _CAPITAL_FIXOS}


def extras_capital(anos: Iterable[int]) -> set[date]:
    out: set[date] = set()
    for ano in anos:
        out |= set(dias_nao_uteis_capital(ano))
    return out


def eh_expediente_reduzido(d: date, capital: bool = False) -> bool:
    return False


_TXT_ART_2 = (
    "Art. 2º do Ato 109/2025: trabalho à distância; ficam suspensos o atendimento "
    "presencial e os prazos APENAS dos processos eletrônicos migrados que dependam "
    "de volumes físicos. Nos demais processos eletrônicos o prazo corre normalmente "
    "(dia tratado como útil)."
)
_TXT_SERVIDOR = (
    "O Ato 109/2025 cita 28/10 (Dia do Servidor) nos considerandos, mas lista 30/10 na "
    "tabela. Este calendário trata 28/10 como não útil e 30/10 como útil: confirme no "
    "calendário do TRT1."
)


def ressalvas(ano: int) -> dict[date, str]:
    """Datas em que o prazo depende de uma condição que o cálculo não conhece."""
    if ano != 2026:
        return {}
    r = {date(2026, m, d): _TXT_ART_2 for m, d in ((4, 20), (6, 5), (8, 10), (12, 7))}
    r[date(2026, 10, 28)] = _TXT_SERVIDOR
    r[date(2026, 10, 30)] = _TXT_SERVIDOR
    return r


def anos_sem_atos(anos: Iterable[int]) -> list[int]:
    return [a for a in anos if a not in ANOS_COM_ATOS]
