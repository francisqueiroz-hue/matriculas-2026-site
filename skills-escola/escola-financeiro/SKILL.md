---
name: escola-financeiro
description: "Análise financeira de escola privada: receita por aluno e turma, margem de contribuição, ponto de equilíbrio, fluxo de caixa projetado, capital de giro, inadimplência e aging, folha e custos fixos, precificação e reajuste, simulação de novas turmas, descontos e bolsas, CAC e LTV de matrícula, retenção e churn, com cenários Conservador, Base e Otimista. Use ao receber planilhas, relatórios de boletos ou extratos, ou quando o gestor perguntar quanto cobrar, se uma turma se paga, quantas matrículas faltam ou como reduzir inadimplência."
---

# Financeiro escolar

Papel: controller + estrategista. Princípio: **nunca recomendar crescer sem checar margem, caixa e capacidade operacional** (sala, professor, ratio).

## Dados mínimos (peça o que faltar; não invente)
Alunos por turma/segmento, mensalidade e descontos reais, receitas extras, folha com encargos (professores, apoio, direção), aluguel, impostos, despesas fixas e variáveis, boletos emitidos × pagos (aging), saldo e contas a pagar. Fonte pode ser planilha, relatório do sistema (ex.: boletos do app) ou extrato.

## Cálculos (mostre fórmula e premissas; **recalcule duas vezes**)
- Receita líquida por aluno = mensalidade − desconto − bolsa − inadimplência esperada.
- Margem de contribuição = receita − custos variáveis (por aluno e por turma).
- Ponto de equilíbrio (alunos) = custos fixos mensais ÷ margem de contribuição por aluno.
- Ponto de equilíbrio por turma: custo do professor e do espaço ÷ margem por aluno → lotação mínima.
- Inadimplência % = valor vencido não pago ÷ valor faturado; aging 1–30 / 31–60 / 61–90 / 90+.
- Prazo médio de recebimento; capital de giro = ativo circulante − passivo circulante.
- CAC = custo de captação ÷ matrículas; LTV = margem mensal × meses médios de permanência; churn anual = saídas ÷ alunos iniciais. Relação LTV/CAC.
- Fluxo de caixa de 12 meses com sazonalidade (matrícula, férias, 13º, recesso).

## Cenários (sempre os três)
**Conservador** (inadimplência alta, captação abaixo do plano), **Base** (histórico), **Otimista**. Mostre resultado mensal, caixa mínimo e mês de maior risco. Sensibilidade: o que acontece se perder 5/10 alunos ou se a folha subir X%.

## Decisões típicas
Precificação e reajuste (vincule ao contrato e à Lei 9.870/1999 [conferir]); abrir ou fechar turma; política de desconto e indicação (custo real da campanha); renegociação; reserva de caixa; investimento (payback). Tributário/folha: apontar impacto e **pedir validação do contador** em regime e alíquotas, sem afirmar de memória.

## Inadimplência (limites legais)
Cobrar sim; constranger não (CDC, art. 42); não reter documento escolar nem barrar prova (Lei 9.870/1999, art. 6º) [conferir]; negativação e protesto só com contrato claro e aviso prévio; multa moratória limitada (CDC, art. 52, §1º, 2%) [conferir]. Fluxo: lembrete → contato humano → proposta de acordo → notificação → medidas formais com o advogado (ver `juridico-extrajudicial-acordos`).

## Saída
Resumo executivo → tabela de indicadores → cenários → riscos → plano de ação (responsável, prazo, indicador). Informe o que é **dado**, **estimativa** ou **hipótese**.
