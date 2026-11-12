"""
Calendário forense do TJRJ — dias sem expediente e dias com prazos suspensos.

Substitui a dependência da biblioteca `holidays`: a categoria OPTIONAL dela
listava dias que NÃO constam como feriado forense no TJRJ (28/10, 24/12,
31/12) e deixava de listar dias que constam (Quinta-feira Santa, São Jorge,
Dia da Justiça). Aqui tudo é explícito, com a base normativa de cada data, e
não muda com a versão de nenhuma biblioteca.

=============================================================================
FONTES (consultadas em 13/10/2026)
=============================================================================
* Lei estadual nº 10.633, de 18/12/2024 (LODJERJ), art. 83 — publicada no
  DORJ-I, n. 236, p. 1, de 19/12/2024:
    I   — sábados, domingos e 8 de dezembro (Dia da Justiça);
    II  — dias declarados ponto facultativo nas repartições públicas estaduais;
    III — segunda, terça e quarta-feira da semana do carnaval;
    IV  — quinta e sexta-feira da Semana Santa;
    V   — feriados nacionais, estaduais e municipais da sede da comarca.
    § 1º — prazos suspensos de 20/12 a 20/01 (sem expediente regular de
           20/12 a 06/01, ressalvado o plantão).
* TJRJ, "Suspensão de Prazos e de Expediente Forense — Calendário de
  Feriados 2026":
    - 1ª e 2ª instâncias, atualização de 05/10/2026
    - Comarca da Capital e 2ª instância, atualização de 11/09/2026
  (Portal do Conhecimento: https://www.tjrj.jus.br/documents/d/portal-conhecimento/
   suspensao-prazos-1a-e-2a-instancia_2026_seesc e
   suspensao-prazos-comarca-capital-e-2a-inst_2026_seesc). O próprio
  informativo declara que "não substitui a publicação oficial".
* Lei estadual nº 5.198/2008 (São Jorge, 23/04); Lei estadual nº 4.007/2002
  (Consciência Negra, 20/11); Lei estadual nº 11.002/2025 (Corpus Christi,
  citada pelo informativo de 2026); Lei federal nº 10.607/2002 e nº 6.802/1980
  (feriados nacionais); Lei Orgânica do Município do Rio de Janeiro, art. 26
  (São Sebastião, 20/01 — só Capital).

=============================================================================
O QUE ESTE MÓDULO NÃO COBRE (cadastre em FERIADOS_FORENSES_EXTRAS)
=============================================================================
* Atos locais de uma comarca/fórum (dezenas por ano: Angra dos Reis, Duque de
  Caxias, Silva Jardim, Regional de Madureira etc.).
* Suspensões que valem só para uma parte (ex.: Avisos do CNJ para prazos que
  envolvam o INSS em 27/01–01/02/2026 ou a AGU em 16–20/03/2026).
* Prorrogações (Atos Executivos 24 e 73/2026): movem só prazos de processos
  eletrônicos que começam ou vencem naquele dia — NÃO tornam o dia não útil e
  por isso ficam registradas, mas fora da contagem.
* Pontos facultativos de 2027 em diante: só existem as regras legais (acima).
  Atualize ATOS e ANOS_COM_ATOS quando o TJRJ publicar o novo informativo; até
  lá, `calcular_prazo` emite aviso.
* Anos anteriores a 2025: as regras do art. 83 só valem a partir da Lei
  10.633/2024; para períodos anteriores, quarta-feira de Cinzas, Quinta-feira
  Santa e 8/12 NÃO são considerados.
"""
from __future__ import annotations

from datetime import date, timedelta
from typing import Iterable, NamedTuple

NOME = "TJRJ"
ATUALIZADO_EM = date(2026, 10, 5)  # data do informativo mais recente consultado
ANOS_COM_ATOS = frozenset({2026})  # anos com pontos facultativos/atos cadastrados
ANO_INICIAL_ART_83 = 2025          # Lei 10.633/2024 em vigor (publicada em 19/12/2024)

# efeitos que tornam o dia NÃO ÚTIL para publicação, início e contagem
EFEITOS_NAO_UTEIS = frozenset({"sem_expediente", "prazos_suspensos", "expediente_reduzido"})


class AtoForense(NamedTuple):
    data: date
    efeito: str    # sem_expediente | prazos_suspensos | expediente_reduzido | prorrogacao
    escopo: str    # estado | capital
    ato: str
    publicacao: str
    nota: str = ""


def _d(m, d, a=2026):
    return date(a, m, d)


ATOS: dict[int, tuple[AtoForense, ...]] = {
    2026: (
        AtoForense(_d(2, 5), "prorrogacao", "estado", "Ato Executivo TJ nº 24, de 05/02/2026",
                   "DJERJ, ADM, n. 106, p. 8, 06/02/2026",
                   "Prazos de processos eletrônicos com início/vencimento em 05/02 -> 06/02. Não torna o dia não útil."),
        AtoForense(_d(2, 13), "sem_expediente", "estado", "Ato Executivo TJ nº 20, de 03/02/2026 (Decreto estadual nº 50.133/2026)",
                   "DJERJ, ADM, n. 104, p. 6, 04/02/2026", "Ponto facultativo; expediente e prazos suspensos."),
        AtoForense(_d(2, 27), "prazos_suspensos", "estado", "Ato Executivo TJ nº 60, de 27/02/2026",
                   "DJERJ, ADM, n. 118, p. 9, 02/03/2026", "Prazos suspensos nas 1ª e 2ª instâncias."),
        AtoForense(_d(3, 27), "prorrogacao", "estado", "Ato Executivo TJ nº 73, de 27/03/2026",
                   "DJERJ, ADM, n. 139, p. 6, 31/03/2026",
                   "Prazos de processos eletrônicos com início/vencimento em 27/03 -> 1º dia útil seguinte. Não torna o dia não útil."),
        AtoForense(_d(4, 24), "sem_expediente", "estado", "Ato Executivo TJ nº 79, de 15/04/2026 (Decreto estadual nº 50.252/2026)",
                   "DJERJ, ADM, n. 149, p. 5, 16/04/2026", "Ponto facultativo; expediente e prazos suspensos."),
        AtoForense(_d(6, 5), "sem_expediente", "estado", "Ato Executivo TJ nº 91, de 28/05/2026 (Decreto estadual nº 50.313/2026)",
                   "DJERJ, ADM, n. 176, p. 6, 29/05/2026 (retif. n. 177, 01/06/2026)", "Ponto facultativo; expediente e prazos suspensos."),
        AtoForense(_d(6, 24), "expediente_reduzido", "estado", "Ato Executivo TJ nº 96, de 09/06/2026 (Decreto estadual nº 50.321/2026)",
                   "DJERJ, ADM, n. 183, p. 8, 11/06/2026", "Jogo do Brasil; expediente das 11h às 15h; prazos suspensos."),
        AtoForense(_d(6, 29), "sem_expediente", "estado", "Ato Executivo TJ nº 103, de 25/06/2026 (Decreto estadual nº 50.346/2026)",
                   "DJERJ, ADM, n. 194, p. 7, 26/06/2026", "Jogo do Brasil; expediente e prazos suspensos."),
        AtoForense(_d(7, 29), "prazos_suspensos", "estado", "Ato Executivo TJ nº 116, de 30/07/2026",
                   "DJERJ, ADM, n. 218, p. 2, 31/07/2026", "Prazos suspensos em todas as unidades."),
        AtoForense(_d(8, 7), "expediente_reduzido", "estado", "Ato Executivo TJ nº 129, de 07/08/2026 (Decreto estadual nº 50.418/2026)",
                   "DJERJ, ADM, n. 224, p. 2, 10/08/2026", "Expediente presencial suspenso a partir das 13h (remoto); prazos suspensos."),
        AtoForense(_d(8, 11), "prazos_suspensos", "estado", "Ato Executivo TJ nº 114, de 29/07/2026",
                   "DJERJ, ADM, n. 217, p. 12, 30/07/2026", "Dia do Advogado; prazos de processos físicos e eletrônicos suspensos em todo o Estado."),
        AtoForense(_d(9, 4), "expediente_reduzido", "capital", "Ato Executivo TJ nº 159, de 03/09/2026 (Decreto estadual nº 50.458/2026)",
                   "DJERJ, ADM, n. 4, p. 17, 04/09/2026", "Só Comarca da Capital e Regionais; 11h às 15h; prazos suspensos."),
        AtoForense(_d(9, 11), "expediente_reduzido", "capital", "Ato Executivo TJ nº 162, de 10/09/2026 (Decreto estadual nº 50.466/2026)",
                   "DJERJ, ADM, n. 8, p. 25, 11/09/2026", "Só Comarca da Capital; 11h às 15h; prazos suspensos."),
    ),
}

# Feriado municipal da Capital (Lei Orgânica do Município do Rio, art. 26).
_CAPITAL_FIXOS = ((1, 20, "São Sebastião (Capital)"),)


def pascoa(ano: int) -> date:
    """Domingo de Páscoa (algoritmo gregoriano de Meeus/Jones/Butcher)."""
    a, b, c = ano % 19, ano // 100, ano % 100
    d, e = b // 4, b % 4
    f = (b + 8) // 25
    g = (b - f + 1) // 3
    h = (19 * a + b - d - g + 15) % 30
    i, k = c // 4, c % 4
    l = (32 + 2 * e + 2 * i - h - k) % 7
    m = (a + 11 * h + 22 * l) // 451
    mes = (h + l - 7 * m + 114) // 31
    dia = ((h + l - 7 * m + 114) % 31) + 1
    return date(ano, mes, dia)


def feriados_estatutarios(ano: int) -> dict[date, str]:
    """Dias sem expediente que decorrem de lei (valem para todo o Estado)."""
    p = pascoa(ano)
    r = {
        date(ano, 1, 1): "Confraternização Universal",
        date(ano, 4, 21): "Tiradentes",
        date(ano, 5, 1): "Dia do Trabalhador",
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
    if ano >= 2003:
        r[date(ano, 11, 20)] = "Consciência Negra (Lei estadual 4.007/2002)"
    if ano >= 2008:
        r[date(ano, 4, 23)] = "Dia de São Jorge (Lei estadual 5.198/2008)"
    if ano >= ANO_INICIAL_ART_83:
        r[p - timedelta(days=46)] = "Carnaval (quarta-feira de Cinzas) — art. 83, III"
        r[p - timedelta(days=3)] = "Quinta-feira Santa — art. 83, IV"
        r[date(ano, 12, 8)] = "Dia da Justiça — art. 83, I"
    return r


_CACHE_ESTADO: dict[int, dict[date, str]] = {}
_CACHE_CAPITAL: dict[int, dict[date, str]] = {}


def _atos_nao_uteis(ano: int, escopo: str) -> dict[date, str]:
    return {
        a.data: f"{a.ato} [{a.efeito}]"
        for a in ATOS.get(ano, ())
        if a.efeito in EFEITOS_NAO_UTEIS and a.escopo == escopo
    }


def dias_nao_uteis(ano: int) -> dict[date, str]:
    """Dias não úteis válidos para TODAS as comarcas do Estado (leis + atos estaduais)."""
    if ano not in _CACHE_ESTADO:
        r = dict(feriados_estatutarios(ano))
        for d, motivo in _atos_nao_uteis(ano, "estado").items():
            r.setdefault(d, motivo)
        _CACHE_ESTADO[ano] = r
    return _CACHE_ESTADO[ano]


def dias_nao_uteis_capital(ano: int) -> dict[date, str]:
    """Só o que se ACRESCENTA para a Comarca da Capital (municipal + atos da Capital)."""
    if ano not in _CACHE_CAPITAL:
        r = {date(ano, m, d): motivo for m, d, motivo in _CAPITAL_FIXOS}
        for d, motivo in _atos_nao_uteis(ano, "capital").items():
            r.setdefault(d, motivo)
        _CACHE_CAPITAL[ano] = r
    return _CACHE_CAPITAL[ano]


def extras_capital(anos: Iterable[int]) -> set[date]:
    """Conjunto pronto para somar a `feriados_extras` quando o prazo corre na Capital."""
    out: set[date] = set()
    for ano in anos:
        out |= set(dias_nao_uteis_capital(ano))
    return out


def eh_expediente_reduzido(d: date, capital: bool = False) -> bool:
    """Dia com expediente parcial e prazos suspensos (tratado como não útil)."""
    for a in ATOS.get(d.year, ()):
        if a.data == d and a.efeito == "expediente_reduzido" and (
            a.escopo == "estado" or (capital and a.escopo == "capital")
        ):
            return True
    return False


def anos_sem_atos(anos: Iterable[int]) -> list[int]:
    return [a for a in anos if a not in ANOS_COM_ATOS]


def ressalvas(ano: int) -> dict[date, str]:
    """Datas em que o prazo depende de condição desconhecida (TJRJ: nenhuma cadastrada)."""
    return {}
