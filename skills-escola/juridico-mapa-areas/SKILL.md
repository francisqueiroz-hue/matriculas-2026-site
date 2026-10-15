---
name: juridico-mapa-areas
description: "Roteador jurídico: dado um problema, identifica todas as áreas do Direito envolvidas (civil, contratual, consumidor, trabalhista, previdenciário, tributário, empresarial/societário, imobiliário, família e sucessões, penal e processo penal, administrativo, constitucional, digital/LGPD, propriedade intelectual, ambiental, eleitoral, educacional, saúde, internacional), lista as vias possíveis (extrajudicial, administrativa, judicial, arbitragem, mediação) e indica qual skill usar (ajeap para análise estratégica, juridico-redator-pecas, juridico-contratos, juridico-direito-educacional, juridico-lgpd, juridico-prazos-prescricao, juridico-pesquisa-verificacao, juridico-extrajudicial-acordos). Use no início de qualquer demanda jurídica nova ou quando o usuário pedir todas as possibilidades."
---

# Mapa de áreas e vias jurídicas

Papel: triagem estratégica para advogado. Entrega **o mapa completo de possibilidades** antes de aprofundar, para não perder uma tese, uma via ou um prazo.

## Passo 1 — fatos mínimos
Quem são as partes, o que aconteceu e quando (datas), documentos que existem, o que o cliente quer (resultado), valor envolvido, foro/comarca e urgência. Falta dado essencial → liste as perguntas e pare. Não presuma fatos a favor do cliente.

## Passo 2 — áreas do Direito a varrer (marque as que incidem)
| Área | Perguntas-chave | Pontos de partida (conferir vigência) |
|---|---|---|
| Civil e contratos | Há inadimplemento, vício, abuso, responsabilidade? | CC; CPC |
| Consumidor | Relação de consumo? Cláusula abusiva, cobrança, publicidade? | CDC (Lei 8.078/1990) |
| Trabalhista | Vínculo, verbas, rescisão, acidente, terceirização? | CLT; Lei 13.467/2017 |
| Previdenciário e acidentário | Benefício, contribuição, afastamento? | Lei 8.213/1991; Lei 8.212/1991 |
| Tributário | Cobrança, planejamento, execução fiscal, regime? | CTN; LC 123/2006; LEF (Lei 6.830/1980) |
| Empresarial e societário | Contrato social, sócios, dissolução, recuperação, falência? | CC; Lei 6.404/1976; Lei 11.101/2005 |
| Imobiliário e locação | Despejo, renovatória, posse, usucapião, registro? | Lei 8.245/1991; CC; Lei 6.015/1973 |
| Família e sucessões | Divórcio, guarda, alimentos, inventário, testamento? | CC; CPC; ECA |
| Penal e processo penal | Há crime, queixa, inquérito, prisão, ação penal? | CP; CPP; leis especiais |
| Administrativo | Ato da Administração, licitação, servidor, concessão? | CF art. 37; Lei 14.133/2021; Lei 9.784/1999 |
| Constitucional | Violação de direito fundamental, controle de constitucionalidade? | CF/88; HC, MS, ADI, ADPF |
| Digital e dados | Vazamento, uso de dados, marco civil, remoção de conteúdo? | LGPD (Lei 13.709/2018); Lei 12.965/2014 |
| Propriedade intelectual | Marca, direito autoral, software, concorrência desleal? | Lei 9.279/1996; Lei 9.610/1998; Lei 9.609/1998 |
| Ambiental e urbanístico | Licença, dano, uso do solo? | Lei 6.938/1981; Lei 9.605/1998 |
| Educacional | Matrícula, mensalidade, bullying, inclusão, supervisão? | LDB; Lei 9.870/1999; ECA — skill `juridico-direito-educacional` |
| Saúde | Plano, SUS, erro, prontuário? | Lei 9.656/1998 |
| Eleitoral / Internacional | Só se houver fato correspondente | Verificar na fonte |

## Passo 3 — vias (para cada área marcada)
1. **Extrajudicial**: notificação, negociação, mediação/conciliação, acordo (ver `juridico-extrajudicial-acordos`).
2. **Administrativa**: Procon, órgãos de supervisão, Receita, INSS, ouvidorias, Conselho de Educação.
3. **Arbitragem**, se houver cláusula.
4. **Judicial**: juízo e rito (juizado, vara cível, trabalhista, execução, tutela de urgência/evidência, mandado de segurança, habeas corpus, ação coletiva), com **custo, prazo e risco de sucumbência**.
5. **Penal/disciplinar** quando couber (queixa, representação, OAB).
Para cada via: viabilidade (Alta/Média/Baixa), prazo, custo, risco, e o **vetor temporal** (acelerar ou postergar) quando houver.

## Passo 4 — prazos e prescrição
Sempre levante prescrição/decadência e prazos fatais (use `juridico-prazos-prescricao`). Prazo urgente em destaque antes de tudo.

## Passo 5 — encaminhamento
Para análise de chances, cenários, mesa de julgamento e tese de superação: `ajeap`. Para peça: `juridico-redator-pecas`. Para contrato: `juridico-contratos`. Para dados e precedentes: `juridico-lgpd` e `juridico-pesquisa-verificacao`.

## Saída
Resumo do caso → tabela de áreas incidentes → vias por área → prazos críticos → perguntas pendentes → próximo passo. Sempre: análise consultiva, sujeita a validação do advogado com registro ativo na OAB. Não prometa resultado; não cite lei ou julgado sem conferir.
