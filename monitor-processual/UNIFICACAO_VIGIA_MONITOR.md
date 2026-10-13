# Unificação Vigia Processual ↔ monitor-processual

Atualizado em 13/10/2026. **Repositório público: nunca commitar números de processo, partes nem o retrato do dia.**

## Situação (atualizada em 13/10/2026)
- **Fase 1 (feita):** contrato de dados e ponte (`core/vigia_contrato.py`), limpeza de duplicados no painel, auditoria dos dados e **calendário por tribunal** (TJRJ, TRT1 e reserva nacional).
- **O que existe na prática:** três cópias quase iguais do mesmo código: (A) o monitor agendado, (B) o Vigia local (derivado do monitor, com a pasta `leitor/` copiada de uma versão anterior, mais painel HTML, exportação para a rotina em nuvem e AJEAP local) e (C) a cópia de trabalho do monitor v6.1.1. A e B consultam DJEN e DataJud todo dia, cada um com o seu banco, e A já importa a lista de processos do B.
- **Descoberta importante:** os processos monitorados são de tribunais diferentes (TRT1, TJRJ, TJSP), e cada um tem o seu calendário. Antes, qualquer versão usava um calendário único.
- **Fase 2 (pendente):** aplicar o ajuste de uma linha no `run_daily.py`, escolher o código-base, migrar as funções exclusivas do Vigia e aposentar a cópia duplicada.

## Arquitetura alvo
```
monitor-processual  (fonte única da verdade)
  run_daily.py: DataJud + DJEN + Gmail + classificador + AJEAP + prazos (calendário por tribunal)
        │  vigia_contrato.montar_documento()  →  retrato_vigia.json (local, fora do git)
        ▼
rotina "Radar Diário Fokus" (Claude)  →  upsert  processos/cnj_<20 dígitos>  (artefato)
        ▼
painel Vigia Processual  (vitrine, acessível do celular)
```
O banco do painel só é acessível de dentro do Claude; por isso a rotina continua sendo a ponte de gravação.

## Quem faz o quê
| Função | Hoje | Destino |
|---|---|---|
| Consulta DataJud / DJEN | programa local VigiaProcessual | `clients/` do monitor; **aposentar o programa local** depois de confirmar que a cobertura é a mesma |
| Leitura de e-mails dos tribunais | rotina Radar Diário (Gmail) | decidir: `gmail_client.py` do monitor ou manter na rotina |
| Análise AJEAP | rotina Radar Diário | decidir entre `ajeap_analise.py` e a rotina (hoje o painel tem AJEAP em todos os registros) |
| Cálculo de prazos | texto livre "prazo em verificação" | `calendar_prazos.py` → bloco `prazo` do documento |
| Cadastro manual | formulário do painel | mantido; a rotina devolve ao monitor os registros "Manual"/"E-mail" |

## Contrato (resumo)
- **Chave:** `id = cnj_<20 dígitos>`, derivada do número CNJ com dígito verificador conferido. Gravar de novo sobrescreve; não duplica.
- **Campos:** `numero, tribunal, autor, reu, tipo, origem, ajuizamento, faseProvavel, ultimaMovData, ultimaMovResumo, urgente, urgenteDescricao, dadosParciais, ajeap` (+ opcionais `nomeLocal, sincronizadoEm, datajud, eventos, linkConsulta, observacaoDataJud, prazo`).
- **Proibido dentro do documento:** `version` (colide com o metadado do banco).
- **`prazo`:** `dataDisponibilizacao, dataPublicacao, dataInicio, dataLimite, dias, tipoContagem, capital, recessoAplicado, avisos, calendario, calculadoEm`.

## Estado dos dados do painel (auditoria de 13/10/2026, após remover 2 duplicados)
14 processos, 14 aceitos pela ponte. Problemas: 14 ids legados fora do padrão `cnj_`, 2 documentos com campo `version`, 7 com DataJud desatualizado (última verificação em 23/09) e 7 sem verificação DataJud.

## Ajuste mínimo no `run_daily.py` (fase 2, item 1)
Em `criar_prazo_para`, a chamada passa a informar o tribunal da comunicação (a coluna `sigla_tribunal` já existe):
```python
r = calcular_prazo(
    data_disp,
    dias,
    classificacao.get("tipo_contagem") or "uteis",
    config.FERIADOS_FORENSES_EXTRAS,
    aplicar_recesso=config.APLICAR_RECESSO_ART_220,
    tribunal=comunicacao.get("sigla_tribunal"),   # <- novo
)
```
Os valores de `tipo_contagem` do classificador (`"uteis"`, `"corridos"` ou nada) são compatíveis com a validação estrita do cálculo. Para processos da Comarca/município da Capital, acrescente `capital=True`.

## Checklist da fase 2
1. Instalar os arquivos novos de `core/` na cópia **agendada** do monitor (com backup) e aplicar o ajuste acima.
2. Decidir o código-base (proposta: o monitor, que é a origem do Vigia) e migrar do Vigia só o que for exclusivo: exportação do retrato para a rotina e painel. A análise AJEAP local sai: a conta da API está sem crédito e a análise já é feita pela rotina em nuvem.
3. `run_daily.py`: montar o documento de cada processo com `montar_documento` + `montar_prazo(tribunal=sigla_do_numero(...))` e gravar `data/retrato_vigia.json`.
4. Rotina em nuvem: ler o JSON e gravar em `processos/<id>`; migrar os ids legados (mapa antigo → `cnj_`) numa única passada, **com a rotina pausada**.
5. Artefato: id do formulário por CNJ, botão travado durante o envio e renderização do bloco `prazo`.
6. A rotina chama `auditar` e avisa se o DataJud passar de 7 dias sem verificação (hoje o bloco de DataJud do painel está parado em 23/09, embora o retrato local seja regerado todo dia: o problema está na sincronização).
7. Aposentar as tarefas agendadas duplicadas e atualizar o texto "De onde vêm os dados" do painel.

## Riscos
- Migrar ids com a rotina ativa recria duplicatas.
- `capital=False` é o padrão (erra para o lado seguro); processos da Comarca/município da Capital precisam de `capital=True`.
- Tribunal sem perfil (ex.: TJSP) usa o calendário nacional de reserva e **sempre** avisa: nunca confie no vencimento sem conferir.
- O TRT1 tem uma inconsistência no próprio ato (Dia do Servidor em 28/10 ou 30/10): o cálculo avisa quando toca 28/10.
- Informativos do TJRJ não substituem o DJERJ; calendário de 2027 ainda sem atos.
