# Calendário do TJRJ e auditoria da contagem de prazos — monitor-processual v6.2

Data: 13/10/2026 · Arquivos: `core/calendario_tjrj.py` (novo), `core/calendar_prazos.py`, `tests/test_prazos.py`

## Atualização de 13/10/2026 — perfis de calendário por tribunal
Os processos monitorados não são só do TJRJ: no painel há processos do **TRT1** (maioria) e do **TJSP**. Um calendário único errava para os demais tribunais. Agora `calcular_prazo(..., tribunal="TRT1")` escolhe o perfil pela sigla do DJEN (`siglaTribunal`):

| Perfil | Fonte | Observações |
|---|---|---|
| `TJRJ` (padrão, quando não se informa tribunal) | Lei est. 10.633/2024, art. 83, e informativos do TJRJ de 2026 | como descrito abaixo |
| `TRT1` | Ato nº 109/2025 do TRT1 (texto lido em 13/10/2026) + Lei 5.010/1966 | Semana Santa de quarta a sexta (01 a 03/04), 11/08 e 08/12 são feriados, recesso de 20/12 a 06/01 como feriado, 30/10 Dia do Servidor |
| `NACIONAL` (reserva) | Leis federais | para qualquer sigla sem perfil (ex.: TJSP, TRT2). **Sempre emite aviso**: o vencimento pode estar errado |

Pontos do Ato 109/2025 que merecem atenção:
- **Art. 2º:** em 20/04, 05/06, 10/08 e 07/12/2026 o trabalho é remoto, mas só os prazos dos *processos eletrônicos migrados que dependam de volumes físicos* ficam suspensos. Nos demais processos o prazo corre; por isso esses dias são tratados como **úteis, com aviso**.
- **Inconsistência do próprio ato:** os considerandos citam o Dia do Servidor em 28/10, a tabela lista 30/10. O calendário segue a tabela (30/10 não útil; 28/10 útil) e **avisa** quando o prazo toca 28/10.
- **Feriados locais** (art. 3º): use `capital=True` (só 20/01, São Sebastião) ou `feriados_extras`.
- Recesso do art. 220 do CPC no processo do trabalho: a aplicação não foi verificada; os dias 07 a 20/01 só são suspensos com `aplicar_recesso=True`.

Verificação dos perfis: 95 testes passam; calendário do TRT1 de 2026 idêntico ao da tabela do ato (escrita à mão); varredura independente do TRT1 (disp. de 01/01 a 30/11/2026); perfis isolados por thread e sem vazamento entre chamadas; 9 defeitos propositais detectados; e **0 diferenças** em 20.352 cenários do TJRJ contra a versão anterior (quem não informa o tribunal continua com o resultado de antes).

## Regra do DJe (conferida no Planalto)
Lei 11.419/2006, art. 4º, § 3º: publicação = 1º dia útil seguinte à disponibilização; § 4º: prazo começa no 1º dia útil seguinte à publicação. Res. CNJ 455/2022: **não verificada** (texto não acessado).

## O que mudou
1. **Calendário explícito do TJRJ** em `core/calendario_tjrj.py`, com a base normativa de cada data. A biblioteca `holidays` deixou de ser usada (não precisa mais estar instalada para o módulo funcionar).
2. **Novo parâmetro** `calcular_prazo(..., capital=False)`: `True` acrescenta o que vale só na Comarca da Capital (São Sebastião 20/01 e os Atos Executivos 159 e 162/2026). Padrão `False` = erro para o lado seguro (data mais cedo).
3. **Novos avisos** em `avisos`: (a) ano sem pontos facultativos/atos cadastrados (hoje: qualquer ano ≠ 2026); (b) publicação/início que passou por dia de expediente reduzido com prazos suspensos.
4. Mantidas as correções da auditoria anterior (tipo_contagem estrito, corridos + recesso, `datetime`).

## Fontes
- Lei estadual 10.633/2024 (LODJERJ), art. 83 — sem expediente: sáb/dom e **8/12**; pontos facultativos estaduais; **seg-ter-qua de Carnaval**; **quinta e sexta da Semana Santa**; feriados nacionais/estaduais/municipais da sede; § 1º: prazos suspensos de 20/12 a 20/01.
- Informativos do TJRJ "Suspensão de prazos e expediente forense — 2026": 1ª/2ª instância (atualização **05/10/2026**) e Capital/2ª instância (**11/09/2026**). O próprio informativo diz que "não substitui a publicação oficial".
- Leis estaduais 5.198/2008 (São Jorge), 4.007/2002 (Consciência Negra), 11.002/2025 (Corpus Christi, citada para 2026); Lei Orgânica do Rio, art. 26 (São Sebastião).

## Dias não úteis de 2026 no calendário (seg–sex)
| Data | Motivo | Ato |
|---|---|---|
| 01/01 | Confraternização | Lei 10.607/2002 |
| 13/02 | Ponto facultativo | Decreto 50.133 + Ato Exec. 20 |
| 16, 17, 18/02 | Carnaval (inclui quarta) | art. 83, III |
| 27/02 | Prazos suspensos | Ato Exec. 60 |
| 02 e 03/04 | Quinta e Sexta Santa | art. 83, IV |
| 21/04 | Tiradentes | Lei 10.607/2002 |
| 23/04 | São Jorge | Lei est. 5.198/2008 |
| 24/04 | Ponto facultativo | Decreto 50.252 + Ato Exec. 79 |
| 01/05 | Dia do Trabalhador | Lei 10.607/2002 |
| 04/06 | Corpus Christi | Lei est. 11.002/2025 |
| 05/06 | Ponto facultativo | Decreto 50.313 + Ato Exec. 91 |
| 24/06 | Expediente 11h–15h, prazos suspensos | Decreto 50.321 + Ato Exec. 96 |
| 29/06 | Ponto facultativo | Decreto 50.346 + Ato Exec. 103 |
| 29/07 | Prazos suspensos | Ato Exec. 116 |
| 07/08 | Remoto a partir das 13h, prazos suspensos | Decreto 50.418 + Ato Exec. 129 |
| 11/08 | Prazos suspensos (Dia do Advogado) | Ato Exec. 114 |
| 07/09, 12/10, 02/11, 20/11, 25/12 | Feriados | leis federais/estaduais |
| 08/12 | Dia da Justiça | art. 83, I |
| **Só Capital:** 20/01, 04/09, 11/09 | São Sebastião; Atos Exec. 159 e 162 (11h–15h, prazos suspensos) | `capital=True` |

**Não** são dias não úteis: 28/10, 24/12 e 31/12 (não constam; a biblioteca `holidays` os marcava), e as **prorrogações** dos Atos 24 (05/02) e 73 (27/03), que só movem prazos de processos eletrônicos que começam/vencem no dia.

Dias cujo status mudou em relação à versão anterior (seg–sex): 2025: 6 · 2026: 15 · 2027: 6 · 2028: 2.

## Resultado da auditoria
| Verificação | Resultado |
|---|---|
| Testes (`pytest tests -k "not parser"`) | **59 passam** (os 3 do parser não rodaram: falta seu `core/datas.py`) |
| Conjunto de dias não úteis de 2026 e 2027 vs lista escrita à mão | idêntico (nenhum a mais, nenhum a menos) |
| Feriados móveis 2025–2035 vs tabela conhecida da Páscoa | 11/11 anos corretos |
| Feriados públicos da `holidays` 2025–2035 contidos no calendário | 100% |
| 4.676 cenários, módulo anterior × novo | 1.351 diferem, **0 sem dia alterado no intervalo** (todas explicadas) |
| Varredura independente dez/2026–jan/2027 (úteis/corridos × recesso on/off × interior/Capital) | 0 divergências |
| Defeitos propositais no calendário e na lógica (9) | 9 detectados pelos testes |
| 12 testes originais × módulo novo | 11 passam; 1 mudou de contrato (ver abaixo) |

**Contrato alterado:** `test_com_recesso_ligado_o_vencimento_e_mais_tarde` exigia `avisos` vazio com o recesso ligado. Agora aparece o aviso de "calendário de 2027 sem atos cadastrados" quando o vencimento passa de 2026. O teste foi ajustado para verificar apenas a ausência do aviso do art. 220.

## Limites (leia antes de confiar)
1. **Atos locais de comarca** (dezenas por ano) não estão no calendário: cadastre em `FERIADOS_FORENSES_EXTRAS`. Avisos do CNJ que suspendem prazos só para INSS/AGU também ficam de fora.
2. **2027 em diante:** só regras legais; o TJRJ ainda não publicou atos de 2027. Atualize `ATOS` e `ANOS_COM_ATOS` em `calendario_tjrj.py` quando sair o informativo (e confira o DJERJ: um decreto de ponto facultativo em 28/10/2026, por exemplo, só valerá se for publicado — o informativo de 05/10 não o lista).
3. **Anos anteriores a 2025:** quarta-feira de Cinzas, Quinta Santa e 8/12 só valem a partir da Lei 10.633/2024.
4. **Interpretação:** dias com "prazos suspensos" e expediente parcial foram tratados como não úteis para publicação, início e contagem; o aviso (b) sinaliza quando isso desloca a publicação. Confirme no ato se o seu caso exige tratamento diferente.
5. **Corpus Christi:** a base citada (Lei est. 11.002/2025) é de 2026; para outros anos confirme.
6. Informativos têm caráter informativo; vale a publicação oficial no DJERJ.

## Instalação
1. Faça backup de `core/calendar_prazos.py` e `tests/test_prazos.py`.
2. Copie os três arquivos `.py` para as mesmas pastas (`core/calendario_tjrj.py` é novo).
3. Em cada chamada de `calcular_prazo`, passe `tribunal=<sigla do DJEN>` e, se for o caso, `capital=True` (procure: `Select-String -Path . -Recurse -Include *.py -Pattern "calcular_prazo"`). Sem `tribunal`, vale o TJRJ.
4. Recomendado para o TJRJ: `APLICAR_RECESSO_ART_220=true` no `.env` (art. 83, § 1º, da Lei 10.633/2024 suspende os prazos de 20/12 a 20/01).
5. Rode `python -m pytest tests -q`. (O modo `python tests/test_prazos.py` direto não é suportado.)
