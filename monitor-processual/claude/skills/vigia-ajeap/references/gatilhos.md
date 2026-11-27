# Gatilhos da análise

Implementação de referência, testada: `core/vigia_analise.py` (`motivos_para_analisar`, `fila_de_analise`). Datas em AAAA-MM-DD ou DD/MM/AAAA.

| Código | Quando dispara | Por quê |
|---|---|---|
| `prazo_em_risco` | há prazo aberto vencendo em até 5 dias corridos e não existe análise que o cubra (análise ausente, anterior à publicação do prazo, ou com mais de 5 dias) | prazo curto é o único caso em que esperar custa caro |
| `sem_ajeap` | o documento não tem o bloco `ajeap` | nunca analisado |
| `novidade_no_retrato` | o retrato do monitor marca `novidade: true` e foi verificado depois da última análise | andamento ou intimação nova |
| `termo_sensivel_novo` | junto com a novidade, o retrato traz termos como "Decurso de Prazo", "Intimação", "Citação" | pede atenção maior, mesmo sem prazo calculado |
| `movimento_posterior_a_analise` | `ultimaMovData`, `datajud.ultimoAndamento` ou o último andamento do retrato é posterior a `ajeapAtualizadoEm` | a análise ficou defasada |
| `analise_antiga_com_prazo_aberto` | análise com mais de 30 dias e ainda há prazo aberto | revisão de segurança |

Observações:
- Documento antigo **sem** `ajeapAtualizadoEm` não dispara por "movimento posterior" (não há data para comparar); passa a ser comparável depois da primeira análise nova.
- Prazo vencido não é "em risco": se um prazo venceu sem providência registrada, **avise Francis** no resumo em vez de tratar como rotina.
- Ordem da fila: menor prazo primeiro; empate pela prioridade da lista acima; depois pelo número. Teto de 5 por execução.
