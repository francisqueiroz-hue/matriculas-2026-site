---
name: juridico-contratos
description: "Elabora, revisa e negocia contratos: prestação de serviços educacionais e de matrícula, locação, compra e venda, prestação de serviços, parceria, franquia, trabalho e estágio, sociedade e acordo de sócios, termo de confidencialidade, aditivos, distratos e termos de uso. Faz matriz de risco por cláusula (abusiva, ambígua, ausente), propõe redação alternativa, confere requisitos legais, multa, rescisão, foro, reajuste, LGPD e assinatura eletrônica. Use ao receber um contrato para revisar ou quando o usuário pedir uma minuta, cláusula ou comparação de versões."
---

# Contratos: elaboração e revisão

## Fluxo
1. **Contexto**: quem é meu cliente, posição (contratante/contratado), objetivo comercial, valor, prazo, risco aceitável, ramo de direito (consumo? civil? trabalhista?) e quem redigiu. Contrato de **consumo** (inclui matrícula escolar) segue o CDC: cláusulas abusivas são nulas, ambiguidade se interpreta a favor do consumidor.
2. **Leitura completa** do documento. Em PDF longo, extraia o texto com `pdftotext -layout`.
3. **Matriz por cláusula**: nº, tema, o que diz, risco (Alto/Médio/Baixo), por quê (norma), sugestão de redação, prioridade de negociação (inegociável / desejável / cedível).
4. **Lacunas**: o que falta (objeto claro, preço e reajuste, vigência, rescisão e multa proporcional, inadimplência, responsabilidade, confidencialidade, LGPD, foro, comunicação formal, anexos).
5. **Redação alternativa** pronta para colar e **resumo executivo** (3 maiores riscos e decisão recomendada: assinar, negociar ou recusar).

## Pontos de verificação (conferir vigência)
- Capacidade e poderes de quem assina; qualificação completa; identificação do objeto.
- Preço, índice de reajuste e periodicidade (reajuste anual mínimo de 12 meses em regra); juros e multa moratória (consumo: multa até 2%, CDC art. 52, §1º) [conferir].
- Rescisão e multa **proporcional**; cláusula penal e redução equitativa (CC, art. 413).
- Foro: em contrato de consumo, o do domicílio do consumidor tende a prevalecer sobre foro de eleição abusivo.
- Prazo prescricional e prova de entrega; cessão e subcontratação; exclusividade; não concorrência (limites).
- Dados pessoais: bases legais, finalidade, operador e compartilhamento (ver `juridico-lgpd`).
- Assinatura eletrônica: Lei 14.063/2020 e MP 2.200-2/2001 (certificação ICP-Brasil) — definir qual nível de assinatura é exigido [conferir].
- **Contrato educacional**: ver `juridico-direito-educacional` (Lei 9.870/1999, inclusão, retenção de documentos, reajuste).
- **Trabalho/estágio**: formalidades próprias (CLT; Lei 11.788/2008) — não usar contrato civil para mascarar vínculo.

## Boas práticas
- Linguagem clara; definições; anexos numerados; histórico de versões.
- Cláusulas de solução de conflitos escalonadas (negociação, mediação, foro).
- Nunca incluir cláusula que o ordenamento proíbe (renúncia antecipada a direito irrenunciável, exoneração total de responsabilidade em consumo).
- Se o contrato for do **cliente do advogado** e favorecer demais a parte contrária, diga com franqueza e indique contrapartidas.

## Saída
Resumo executivo → matriz de riscos → lacunas → redações alternativas → pendências de verificação. Ressalva: minuta e análise consultivas, sujeitas à validação do advogado responsável.
