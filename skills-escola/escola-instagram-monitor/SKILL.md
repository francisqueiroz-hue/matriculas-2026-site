---
name: escola-instagram-monitor
description: "Monitora e analisa o desempenho do Instagram da escola (Espaço Kids / Instituto Fokus): alcance, engajamento, salvamentos, compartilhamentos, crescimento, cliques para o WhatsApp, melhores formatos e horários, triagem de comentários e DMs, alertas de crise e comparação com o funil de matrículas. Usa o conector Meta quando disponível ou dados colados/exportados. Use para relatório semanal ou mensal, diagnóstico de queda, o que repetir ou parar, e ideias de teste, sem raspagem proibida e sem inventar métricas."
---

# Monitor de Instagram da escola

Objetivo: transformar métricas em decisão de **captação**, não em vaidade. Funil: atração → lead → visita → matrícula → retenção → indicação.

## Fontes de dados (nesta ordem)
1. **Conector Meta** (se estiver na sessão): contas do Instagram vinculadas, mídias e métricas de insights. Leia, não altere. Use a visão de anúncios apenas se houver campanha paga.
2. **Exportação do Instagram/Meta Business Suite** (CSV) ou prints colados pelo usuário.
3. **Nunca** fazer scraping do Instagram nem pedir senha da conta (violaria os termos da plataforma). Concorrentes: só dados públicos e a Biblioteca de Anúncios da Meta.
Se não houver dado, diga o que falta e como exportar. **Não estime métrica que não foi fornecida.**

## Métricas e como ler
| Métrica | Pergunta que responde |
|---|---|
| Alcance e % de não seguidores | A mensagem chega a famílias novas? |
| Salvamentos e compartilhamentos por alcance | O conteúdo é útil o bastante para guardar e indicar? |
| Engajamento por alcance (não por seguidores) | O formato ressoa? |
| Visitas ao perfil e cliques no link/WhatsApp | O post gerou intenção? |
| Leads e visitas agendadas (dados da secretaria) | O Instagram vira matrícula? |
Compare períodos iguais (semana × semana, mesmo número de posts). Separe orgânico de pago. Aponte amostra pequena como **indício**, não conclusão.

## Rotina
- **Semanal** (relatório de 1 página): top 3 e bottom 3 posts, o que repetir, o que parar, 2 testes para a próxima semana, pendências de comentários e DMs.
- **Mensal**: tendência, formatos, horários, funil até matrícula, custo por lead se houver anúncio, plano do mês.
- **Alerta**: queda brusca de alcance, comentário negativo viral, menção a incidente, vazamento de imagem de aluno, perfil falso usando o nome da escola.

## Triagem de comentários e DMs
Classifique: dúvida de matrícula (responder rápido e levar ao WhatsApp), elogio, reclamação (resposta empática pública curta e detalhe em privado), caso sensível (saúde, incidente, dados de aluno: **não discutir em público**, encaminhar à direção), spam/ofensa (arquivar). Não confirme se alguém é aluno nem exponha dado de família (LGPD). Respostas devem seguir o tom da skill `escola-comunicacao-familias`.

## Saída
Resumo executivo → tabela de métricas com variação → insights (fato / interpretação / hipótese) → ações com responsável, prazo e indicador → o que falta medir. Para pesquisar trends, criar o pacote do dia e programar publicações, use `escola-instagram-studio`; para legendas, `instagram-matriculas-fokus`; para a arte, `escola-imagens-marca`.
