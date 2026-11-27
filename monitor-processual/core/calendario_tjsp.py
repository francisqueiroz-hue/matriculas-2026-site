"""
Calendário do TJSP (Tribunal de Justiça do Estado de São Paulo) para 2026.

Fontes (lidas em 13/10/2026):
* Provimento CSM nº 2.813/2025 (DJE de 25/11/2025): dias sem expediente em 2026 e
  relação de feriados municipais. https://esaj.tjsp.jus.br/gcn-frontend-vue/legislacao/find/236794
* Provimento CSM nº 2.845/2026 (DJE de 02/10/2026): transfere o Dia do Servidor
  Público de 28/10 para 30/10/2026; 28/10 passa a ter expediente.
  https://esaj.tjsp.jus.br/gcn-frontend-vue/legislacao/find/246161
  (motivo: Portaria SG/CNJ nº 81/2025.)

Sem expediente em 2026 (Provimento 2.813/2025, art. 1º, com a alteração acima):
16 e 17/02 Carnaval; 02/04 Endoenças; 03/04 Sexta-feira da Paixão; 20/04
suspensão; 21/04 Tiradentes; 01/05; 04/06 Corpus Christi; 05/06 suspensão; 09/07
Data Magna do Estado; 10/07 suspensão; 07/09; 12/10; 30/10 Dia do Servidor
(transferido); 02/11 Finados; 20/11 Consciência Negra; 07/12 suspensão; 08/12 Dia
da Justiça; recesso de 01 a 06/01 e de 20 a 31/12 (§ 1º). Fica de fora (dia útil):
28/10/2026 (art. 2º do Provimento 2.845/2026). 18/02 (Quarta-feira de Cinzas):
expediente a partir das 13h (art. 2º), tratado aqui como dia útil COM ressalva.
01/01 e 25/12 são feriados nacionais.

Feriados municipais: o Provimento traz a relação por comarca. Este módulo cobre
apenas a CAPITAL (`capital=True`): 25/01 (aniversário da cidade; Sexta-feira Santa,
Corpus Christi, Finados e 20/11 já são dias sem expediente). Outras comarcas:
informe as datas em `feriados_extras` (consulte a relação do Provimento; ela pode
mudar durante o ano — art. 4º).

Recesso do art. 220 do CPC (20/12 a 20/01): os dias 07 a 20/01 só são suspensos
com `aplicar_recesso=True`; 20 a 31/12 e 01 a 06/01 já constam como sem expediente.

Anos diferentes de 2026: as REGRAS são replicadas, mas sem ato do ano;
`calcular_prazo` emite aviso (`anos_sem_atos`).
"""
from __future__ import annotations

from datetime import date, timedelta
from typing import Iterable

from .calendario_tjrj import pascoa

NOME = "TJSP"
ATUALIZADO_EM = date(2026, 10, 2)  # DJE do Provimento CSM nº 2.845/2026
ANOS_COM_ATOS = frozenset({2026})

_FIXOS = (
    (1, 1, "Confraternização Universal (Lei 662/1949)"),
    (4, 21, "Tiradentes (Lei 662/1949)"),
    (5, 1, "Dia do Trabalho (Lei 662/1949)"),
    (7, 9, "Data Magna do Estado de São Paulo (Lei estadual 9.497/1997)"),
    (9, 7, "Independência do Brasil (Lei 662/1949)"),
    (10, 12, "Nossa Senhora Aparecida (Lei 6.802/1980)"),
    (11, 2, "Finados (Lei 662/1949)"),
    (11, 15, "Proclamação da República (Lei 662/1949)"),
    (12, 8, "Dia da Justiça (Provimento CSM 2.813/2025)"),
    (12, 25, "Natal (Lei 662/1949)"),
)

# Atos do ano: o que as regras gerais não derivam (Provimentos CSM 2.813/2025 e 2.845/2026).
_ATOS: dict[int, dict[date, str]] = {
    2026: {
        date(2026, 4, 20): "Suspensão do expediente (Provimento CSM 2.813/2025)",
        date(2026, 6, 5): "Suspensão do expediente (Provimento CSM 2.813/2025)",
        date(2026, 7, 10): "Suspensão do expediente (Provimento CSM 2.813/2025)",
        date(2026, 10, 30): "Dia do Servidor Público, transferido de 28/10 (Provimento CSM 2.845/2026)",
        date(2026, 12, 7): "Suspensão do expediente (Provimento CSM 2.813/2025)",
    },
}

_CAPITAL_FIXOS = ((1, 25, "Aniversário da cidade de São Paulo"),)


def feriados(ano: int) -> dict[date, str]:
    """Todos os dias sem expediente do TJSP no ano (inclui fins de semana)."""
    p = pascoa(ano)
    r: dict[date, str] = {date(ano, m, d): motivo for m, d, motivo in _FIXOS}
    if ano >= 2024:
        r[date(ano, 11, 20)] = "Consciência Negra (Lei 14.759/2023)"
    r[p - timedelta(days=48)] = "Carnaval (segunda-feira)"
    r[p - timedelta(days=47)] = "Carnaval (terça-feira)"
    r[p - timedelta(days=3)] = "Endoenças (quinta-feira santa)"
    r[p - timedelta(days=2)] = "Sexta-feira da Paixão"
    r[p + timedelta(days=60)] = "Corpus Christi"
    for dia in range(1, 7):
        r[date(ano, 1, dia)] = "Recesso forense (Provimento CSM 2.813/2025, art. 1º, § 1º)"
    for dia in range(20, 32):
        r[date(ano, 12, dia)] = "Recesso forense (Provimento CSM 2.813/2025, art. 1º, § 1º)"
    r.update(_ATOS.get(ano, {}))
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
    """O TJSP não suspende prazos por expediente reduzido; ver `ressalvas` (Quarta-feira de Cinzas)."""
    return False


_TXT_CINZAS = (
    "Quarta-feira de Cinzas: o expediente do TJSP começa às 13h (Provimento CSM "
    "2.813/2025, art. 2º). O dia é tratado como ÚTIL; se o prazo começar ou vencer "
    "nele, confira nos autos."
)
_TXT_SERVIDOR = (
    "Dia do Servidor Público: o Provimento CSM 2.845/2026 transferiu a data de 28/10 "
    "para 30/10/2026 (28/10 tem expediente; 30/10 não). Confira se não houve novo ato."
)


def ressalvas(ano: int) -> dict[date, str]:
    """Datas em que o prazo depende de condição que o cálculo não conhece."""
    if ano != 2026:
        return {}
    return {
        date(2026, 2, 18): _TXT_CINZAS,
        date(2026, 10, 28): _TXT_SERVIDOR,
        date(2026, 10, 30): _TXT_SERVIDOR,
    }


def anos_sem_atos(anos: Iterable[int]) -> list[int]:
    return [a for a in anos if a not in ANOS_COM_ATOS]
