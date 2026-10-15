---
name: juridico-pesquisa-verificacao
description: "Pesquisa e verificação de fontes jurídicas oficiais: legislação vigente no Planalto, súmulas e temas repetitivos do STJ, TST, STF, jurisprudência de TJ e TRT, normas do CNE/MEC, Receita e ANPD, e checagem anti-alucinação de citações (existência do julgado, tese real, data, órgão, trânsito, superação). Classifica cada fonte como verificada ou a confirmar, e monta tabelas de precedentes pró e contra. Use antes de citar lei ou precedente em parecer, peça, contrato ou comunicado, ou para validar citações de uma peça recebida."
---

# Pesquisa e verificação de fontes jurídicas

Objetivo: **nenhuma citação sem conferência**. Citação errada é ponto fraco do caso.

## Fontes por prioridade
1. **Legislação**: planalto.gov.br (texto consolidado, observando "Vigência" e alterações), leis estaduais e municipais nos portais oficiais.
2. **Tribunais**: portais do STF, STJ, TST, TRT, TJ e CNJ (súmulas, temas repetitivos, repercussão geral, IRDR, pesquisa de jurisprudência). Conferir **número do tema, tese fixada, ratio decidendi, data e trânsito**.
3. **Órgãos reguladores**: CNE/MEC, INEP, ANPD, Receita Federal, PGFN, Banco Central, CVM.
4. **Doutrina e notícias**: só como apoio, rotulado como tal. Sites secundários não provam lei nem precedente.

## Protocolo de verificação (para cada citação)
1. Existe? (número e órgão batem) 2. A tese atribuída é a tese real? 3. Está **vigente** ou foi superada/cancelada/alterada? 4. É vinculante ou persuasivo? 5. Os fatos são análogos ao caso?
Resultado por item: **[VERIFICADO — fonte + link + data de consulta]**, **[PARCIAL]**, **[NÃO CONFIRMADO]** ou **[INCORRETO — o que é de fato]**. Nunca omitir o que não se confirmou.

## Busca
- Anonimize: pesquise a **tese e o tribunal**, nunca nomes de partes nem número de processo.
- Procure também precedente **contrário** e eventual superação (overruling) ou distinção.
- Cuidado com ementas copiadas de blog: abra o acórdão oficial.
- Se a ferramenta de busca não alcançar o portal, diga e liste a consulta exata para o usuário rodar (termos, órgão, período).

## Saída
Tabela: tema → norma/precedente → órgão e número → tese → status (vigente/superado) → favorável/contrário → link → nível de confiança. Seguida de **lacunas** (o que não consegui confirmar) e **próximos passos**. Para estratégia de superação de precedente, use `ajeap`.

## Radar normativo (Boletim Normativo) — complementa o Vigia, não o substitui
Escopo: **mudanças de lei, norma, súmula, tema e precedente**. Fora do escopo (já cobertos pelo Radar Diário Fokus e pelo Vigia — AJEAP e minutas): processos, prazos, movimentações, Gmail, painel Vigia, análise AJEAP e rascunho de peças.
Regras de convivência (inegociáveis):
1. **Somente leitura**; nunca grave no painel, em ArtifactData, na coleção `processos` nem no Doc "Radar Diário Fokus". Escreva só no próprio Doc privado "Boletim Normativo — Fokus", atualizado em lugar, sem criar cópias.
2. Não use Gmail, Calendar, Docusign, Dropbox, Box, Notion, Canva nem Meta Ads; não envie mensagem.
3. Busque **só a tese e o órgão**, nunca nome de parte nem número de processo; não consulte processos.
4. Fontes **oficiais**: Planalto, DOU e Diário Oficial estadual, informativos de STF, STJ e TST, CNJ, MEC/CNE, ANPD, Receita.
5. Cada item traz **tags de área/tese** no vocabulário do campo `tipo` dos processos, para que o advogado ou o Vigia cruzem (a skill não cruza).
6. Sem novidade relevante: "sem alterações em <data>", sem notificação.
Item: data, tipo, fonte com link, resumo, tags, impacto prático (escola, contrato, prazo), efeito sobre precedentes (superado, alterado, novo), urgência (Alta/Média/Baixa), confiança (verificado ou não confirmado). Mudança que afete contrato, comunicado ou política da escola: encaminhe a `juridico-contratos`, `juridico-direito-educacional` ou `juridico-lgpd`. Conteúdo jurídico nas redes: Código de Ética da OAB e regras de publicidade da advocacia, sem captação de clientela nem promessa de resultado [conferir normas vigentes]. Roteiro de integração e texto da rotina: `INTEGRACAO-VIGIA-RADAR.md` (no repositório).

## Regras
Não inventar nº de processo, tema, súmula ou link. Não "completar" ementa de memória. Datas e artigos conferidos duas vezes. Em tema de alta relevância (liberdade, patrimônio relevante, prazo), recomendar conferência pelo advogado nos autos.
