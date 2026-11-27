"""
Calendário NACIONAL de reserva — usado quando o tribunal não tem perfil cadastrado.

Só o que decorre de lei federal ou é prática uniforme: feriados nacionais
(Leis 662/1949, 10.607/2002, 14.759/2023 para 20/11 a partir de 2024), Sexta-feira
Santa, segunda e terça de Carnaval e Corpus Christi. NÃO inclui pontos
facultativos, feriados estaduais/municipais, Quinta-feira Santa, Quarta-feira de
Cinzas nem dias de atos do tribunal. `calcular_prazo` sempre emite aviso quando
cai neste perfil, porque o vencimento pode estar errado em ambas as direções.

Perfis cadastrados: ver core/calendarios.py (TJRJ e TRT1).
"""
from __future__ import annotations

from datetime import date, timedelta
from typing import Iterable

from .calendario_tjrj import pascoa

NOME = "NACIONAL"
ATUALIZADO_EM = None
ANOS_COM_ATOS = frozenset()


def dias_nao_uteis(ano: int) -> dict[date, str]:
    p = pascoa(ano)
    r = {
        date(ano, 1, 1): "Confraternização Universal",
        date(ano, 4, 21): "Tiradentes",
        date(ano, 5, 1): "Dia do Trabalho",
        date(ano, 9, 7): "Independência do Brasil",
        date(ano, 10, 12): "Nossa Senhora Aparecida",
        date(ano, 11, 2): "Finados",
        date(ano, 11, 15): "Proclamação da República",
        date(ano, 12, 25): "Natal",
        p - timedelta(days=48): "Carnaval (segunda-feira)",
        p - timedelta(days=47): "Carnaval (terça-feira)",
        p - timedelta(days=2): "Sexta-feira Santa",
        p + timedelta(days=60): "Corpus Christi",
    }
    if ano >= 2024:
        r[date(ano, 11, 20)] = "Consciência Negra (Lei 14.759/2023)"
    return r


def dias_nao_uteis_capital(ano: int) -> dict[date, str]:
    return {}


def extras_capital(anos: Iterable[int]) -> set[date]:
    return set()


def eh_expediente_reduzido(d: date, capital: bool = False) -> bool:
    return False


def ressalvas(ano: int) -> dict[date, str]:
    return {}


def anos_sem_atos(anos: Iterable[int]) -> list[int]:
    return list(anos)
