# Unificação Vigia Processual ↔ monitor-processual

Atualizado em 13/10/2026. **Repositório público: nunca commitar números de processo, partes nem o retrato do dia.**

## Situação
- **Fase 1 (feita):** contrato de dados e ponte (`core/vigia_contrato.py`, 17 testes), limpeza dos duplicados no painel e auditoria dos dados.
- **Fase 2 (pendente):** ligar o `run_daily.py` à ponte e atualizar a rotina e o artefato. Depende do código do monitor (`run_daily.py`, `db.py`) e do programa local VigiaProcessual, que ainda não foram vistos.

## Arquitetura alvo
```
monitor-processual  (fonte única da verdade)
  run_daily.py: DataJud + DJEN + Gmail + classificador + AJEAP + prazos (calendário TJRJ)
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

## Checklist da fase 2
1. Localizar o programa local: `Get-ChildItem "D:\Users\francis\Documents" -Directory -Recurse -Depth 3 -Filter "*vigia*"`.
2. Comparar a cobertura DataJud/DJEN do programa local com `clients/` do monitor.
3. `run_daily.py`: montar o documento de cada processo com `montar_documento` + `montar_prazo` e gravar `data/retrato_vigia.json`.
4. Rotina: ler o JSON e gravar em `processos/<id>`; migrar os 14 ids legados (mapa antigo → `cnj_`) numa única passada, **com a rotina pausada**, para não recriar duplicatas.
5. Artefato: id do formulário por CNJ, botão travado durante o envio e renderização do bloco `prazo`.
6. A rotina chama `auditar` e avisa se o DataJud passar de 7 dias sem verificação.
7. Aposentar o programa local e atualizar o texto "De onde vêm os dados" do painel.

## Riscos
- Migrar ids com a rotina ativa recria duplicatas.
- `capital=False` é o padrão (erra para o lado seguro); processos da Comarca da Capital precisam de `capital=True`.
- Informativos do TJRJ não substituem o DJERJ; calendário de 2027 ainda sem atos.
