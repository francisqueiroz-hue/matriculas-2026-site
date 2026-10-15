# Integração: Boletim Normativo × Radar Diário Fokus × Vigia Processual

Objetivo: o **Boletim Normativo** (skill `juridico-pesquisa-verificacao`, seção "Radar normativo") **complementa** as rotinas existentes e **não duplica nem conflita** com elas. Nada nas rotinas atuais foi alterado.

## O que já existe (lido das rotinas agendadas em 15/10/2026)
| Rotina | Horário (SP) | Faz |
|---|---|---|
| **Radar Diário Fokus** | 07:22 | Triagem Gmail (rótulos), extração de CNJ, sincroniza o app Vigia Processual, roda o AJEAP pendente, atualiza o Doc "Radar Diário Fokus" |
| **Vigia — AJEAP e minutas** | 08:23 | Reanalisa processos com novidade/prazo (máx. 5), grava o campo `ajeap`, redige RASCUNHOS de peças. Modo conferência até 15/10; **modo normal a partir de 16/10** |
| **Fokus Captação / Revisão estratégica** | 08:17 diária / dias 1, 14, 28 | Captação, concorrência e Instagram (briefing e aprendizado) |

## Divisão de trabalho (sem sobreposição)
| Tema | Dono | Boletim Normativo |
|---|---|---|
| Processos, prazos, movimentações, AJEAP, minutas | Radar + Vigia | **Não toca** |
| Gmail (triagem, rótulos, newsletters) | Radar | **Não lê** |
| Painel / ArtifactData / coleção `processos` | Radar + Vigia | **Não lê nem grava** |
| Mudança de **lei, norma, súmula, tema, precedente** | (ninguém hoje, exceto verificação pontual do Vigia) | **Dono** |
| Pesquisa na web | Vigia: só tese + tribunal, sem nomes/CNJ | Mesma regra |

## Regras de convivência do Boletim
1. **Somente leitura e fontes oficiais.** Sem Gmail, Calendar, Docusign, Dropbox, Box, Notion, Canva, Meta Ads, sem envio de mensagens.
2. **Nunca** cita nome de parte nem número de processo em busca, e não cruza com `processos`.
3. **Não escreve** em nenhum recurso das outras rotinas. Escreve só no **próprio Doc privado** "Boletim Normativo — Fokus" (um doc, atualizado em lugar, sem criar cópias).
4. Cada item traz **tags de área/tese** (ex.: `trabalhista/professor`, `locação/despejo`, `educacional/mensalidade`, `penal/prisão-cautelar`, `LGPD/menores`) no mesmo vocabulário do campo `tipo` dos processos, para o **advogado ou o Vigia cruzarem** com o que já tem.
5. Roda **antes** do Radar (sugestão: **06:47**, diário), para que o conteúdo esteja pronto quando as outras rotinas rodarem.
6. Sem novidade relevante: grava "sem alterações" e **não gera notificação**.
7. Não repete o que o Radar já mostra (ex.: newsletters de Gmail); foco em **fonte primária**.

## Como o Boletim "auxilia na execução do serviço" (sem alterar as rotinas)
- **Vigia (passo 3, verificação de precedente):** o Boletim registra `precedente superado/alterado`, `tema novo` e `súmula cancelada`. O advogado pode pedir ao Vigia para consultar o Doc antes de afirmar precedente.
- **Plano de ação do AJEAP:** mudança normativa com prazo (vacatio legis, termo inicial) vira alerta com data.
- **Escola:** mudança em Lei 9.870, LGPD, CNE/MEC, convenção coletiva dispara sugestão de revisão de contrato/comunicado (skills `juridico-contratos`, `juridico-direito-educacional`).

## Texto da rotina (para criar com a sua aprovação — NÃO criada)
Nome sugerido: **Boletim Normativo Fokus (jurídico, só fontes oficiais)** — cron `CRON_TZ=America/Sao_Paulo 47 6 * * *`.

> Você é a rotina "Boletim Normativo Fokus" de Francis Wagner de Queiroz Ribeiro (advogado e gestor escolar). Faça um radar de MUDANÇAS NORMATIVAS E DE PRECEDENTES nas últimas 24 h (segunda: 72 h), só com fontes oficiais: Planalto, Diário Oficial da União e do RJ, informativos de STF, STJ, TST, CNJ, MEC/CNE, ANPD e Receita. Áreas: trabalhista (escolas e professores), cível/locação/execução, consumidor/educacional (Lei 9.870), LGPD, tributário escolar, penal/processo penal, família/sucessões.
> LIMITES: somente leitura; não use Gmail, Calendar, Docusign, Dropbox, Box, Notion, Canva nem Meta Ads; não escreva em ArtifactData, no painel Vigia, no Doc "Radar Diário Fokus" nem na coleção "processos"; não consulte processos; nas buscas use só a tese e o órgão, nunca nomes de partes nem número de processo; nunca invente norma, tema, súmula ou link; nunca redija peça nem envie mensagem.
> SAÍDA: atualize (no mesmo doc, sem criar cópias) o Claude Doc privado "Boletim Normativo — Fokus". Para cada item: data; tipo (lei, MP, decreto, súmula, tema, informativo, resolução); fonte oficial com link; resumo de 1–2 linhas; tags de área/tese; impacto prático (escola, contrato, prazo); efeito sobre precedentes (superado, alterado, novo); urgência (Alta/Média/Baixa); "cruzar com processos de tipo X"; confiança (verificado/parcial). Itens verificados vs. não confirmados em listas separadas. Se não houver novidade relevante, escreva "sem alterações em <data>" e encerre sem notificação. Se houver item de urgência Alta, resuma em até 3 linhas para notificação.

## Trechos opcionais para as rotinas existentes (SÓ se você quiser; eu não alterei nada)
- **Vigia, passo 3 — acrescentar:** "Antes de citar precedente, consulte o último item do Doc 'Boletim Normativo — Fokus' (somente leitura) e, se houver superação, alteração ou tema novo na mesma tese, mencione em `cenariosNota` e verifique na fonte oficial."
- **Radar, Resumo executivo — acrescentar:** "Se o Boletim Normativo tiver item de urgência Alta nas últimas 24 h, cite em 1 linha com o link do Doc."
Ambos respeitam as chaves fixas do campo `ajeap` (não criam chaves novas).

## Pontos de atenção que encontrei
1. O modo conferência do Radar e do Vigia **termina em 15/10/2026**; a partir de 16/10 eles passam a gravar. Não mexa nos prompts nesse intervalo sem necessidade.
2. A rotina "Fokus Captação" cita como recompensa de indicação **1 mês de atividade extra + kit escolar**, enquanto a skill `instagram-matriculas-fokus` diz para **não citar desconto nem kit de material**. Defina qual regra vale antes de automatizar posts de indicação (a skill `escola-instagram-studio` segue a da skill do Instagram até você decidir).
