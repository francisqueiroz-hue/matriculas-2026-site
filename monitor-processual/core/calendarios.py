"""
Registro de perfis de calendário por tribunal.

`resolver(sigla)` devolve (nome, módulo, é_reserva). A sigla é a do DJEN
(`siglaTribunal`): "TJRJ", "TRT1" etc. Sem sigla (None) usa o perfil padrão
TJRJ, que é o comportamento anterior à existência de perfis.
Sigla sem perfil -> calendário NACIONAL de reserva (`é_reserva=True`), e o
cálculo avisa que o resultado precisa de conferência.

Para cadastrar outro tribunal: criar core/calendario_<sigla>.py com a mesma
interface (NOME, ANOS_COM_ATOS, dias_nao_uteis, dias_nao_uteis_capital,
extras_capital, eh_expediente_reduzido, ressalvas, anos_sem_atos) e registrar
em PERFIS.
"""
from __future__ import annotations

import re

from . import calendario_nacional, calendario_tjrj, calendario_trt1

PERFIS = {
    "TJRJ": calendario_tjrj,
    "TRT1": calendario_trt1,
}
PERFIL_PADRAO = "TJRJ"
NACIONAL = calendario_nacional


def normalizar_sigla(sigla) -> str | None:
    """'trt-1', 'TRT 1', 'TRT01', 'TRT1ª' -> 'TRT1'; 'tjrj' -> 'TJRJ'; vazio -> None."""
    if sigla is None:
        return None
    s = re.sub(r"[\s\-_.ªº°]", "", str(sigla)).upper()
    if not s:
        return None
    m = re.fullmatch(r"TRT0*(\d{1,2})(?:REGIAO|REGIÃO)?", s)
    if m:
        return f"TRT{int(m.group(1))}"
    return s


def resolver(sigla) -> tuple[str, object, bool]:
    s = normalizar_sigla(sigla)
    if s is None:
        return PERFIL_PADRAO, PERFIS[PERFIL_PADRAO], False
    if s in PERFIS:
        return s, PERFIS[s], False
    return s, NACIONAL, True
