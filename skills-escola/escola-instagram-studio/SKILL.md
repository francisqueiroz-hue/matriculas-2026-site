---
name: escola-instagram-studio
description: "Rotina diária de Instagram da escola (Espaço Kids / Instituto Fokus): pesquisa de trends e pautas da região (Camboinhas, Região Oceânica, Niterói/RJ), datas e eventos locais, dúvidas das famílias; cria o pacote do dia com stories, feed (foto e carrossel) e Reels, gera legendas, roteiros e briefing de arte; monta a fila de publicação programada com horários e aprovação humana; e publica pela API oficial do Instagram ou agendador nativo. Use para planejar o dia ou a semana, transformar trend em conteúdo e programar postagens, sem inventar fatos nem expor crianças."
---

# Instagram Studio — pesquisa, criação e programação diária

Complementa `instagram-matriculas-fokus` (voz e fórmulas de legenda, dados fixos da marca), `escola-imagens-marca` (arte) e `escola-instagram-monitor` (métricas). Use os dados fixos da marca daquela skill; não invente preço, vaga, depoimento, resultado ou prêmio.

## 0. Convivência com as rotinas existentes
A rotina **Fokus Captação** já faz monitor da planilha, briefing semanal de mercado e relatório de aprendizado, e entrega o plano de ativos. Esta skill **não refaz** isso: ela **consome** o briefing e o banco de inteligência (leitura) e **executa** o dia a dia (pauta, peças, fila). Não grava na planilha de captação, não envia mensagens e não publica sem aprovação. Regra de indicação: siga a skill `instagram-matriculas-fokus` até o gestor definir qual vale (ela diz para não citar desconto nem kit; a rotina de captação cita atividade extra e kit).

## 1. Pesquisa de trends da região (diária, ~10 min)
Fontes (pesquise na web, cite o link e a data; separe **fato** de **hipótese**):
- Agenda local: Prefeitura de Niterói, eventos da Região Oceânica, feriados, calendário escolar e datas do mês (Dia das Crianças, Dia do Professor, volta às aulas, chuvas, clima, férias).
- Assuntos de famílias: reportagens e perguntas recorrentes (adaptação, alimentação, telas, sono, brincar, alfabetização, transição EI→EF).
- Dentro do Instagram: o que a **própria conta** e concorrentes locais publicam (somente conteúdo público e a Biblioteca de Anúncios da Meta). **Não é possível consultar com segurança áudios ou hashtags "em alta" por API pública**: peça ao usuário a lista da aba Reels/Em alta ou use ferramenta oficial, e rotule como informada.
- Cuidado: não pegar carona em tragédia, política partidária, religião, saúde sensacionalista ou assunto que exponha crianças.
Saída: 3 a 5 pautas, cada uma com **gancho**, ligação com a escola, risco (Baixo/Médio/Alto) e prazo de validade da trend.

## 2. Pacote do dia (mix padrão)
| Formato | Quantidade | Função |
|---|---|---|
| Stories | 3 a 5 (manhã, meio-dia, tarde) | Bastidor, enquete, caixa de perguntas, lembrete com CTA |
| Feed | 1 (foto única ou carrossel) | Autoridade, utilidade, indicação |
| Reels | 3 a 4 por semana | Alcance: trend adaptada, bastidor, dica de 15 a 30 s |
Distribuição semanal: ao menos 1 conteúdo de matrícula com CTA para o WhatsApp, 1 de indicação ("Indique um Amigo, Multiplique o Afeto"), os demais de valor e afeto. Evite mais de 1 CTA por peça.

Para cada peça entregue: formato e objetivo → texto (legenda ou roteiro com tempo de cada cena) → texto na tela → briefing de arte (para `escola-imagens-marca`) → horário sugerido → hashtags (3 a 5) → alt text → **checklist de risco**.

## 3. Checklist de risco (obrigatório antes de qualquer fila)
- [ ] Nenhuma criança identificável sem autorização escrita e atual (ECA; LGPD, art. 14); preferir mãos, objetos, ilustração, ambiente.
- [ ] Sem preço, vaga, desconto, resultado ou estrutura que não esteja confirmado (CDC, art. 37).
- [ ] Sem dado de aluno/família, sem laudo, sem incidente.
- [ ] Trend sem conotação política, sensível ou polêmica; música/áudio com licença para uso comercial.
- [ ] Ortografia, acentos, nome da escola correto, telefone do WhatsApp conferido.
- [ ] Revisão do advogado em peça com consequência jurídica (promoção, sorteio, concurso).

## 4. Fila de publicação programada
Formato de fila (JSON), uma entrada por peça: `id`, `tipo` (IMAGE, CAROUSEL, REELS, STORIES), `data_hora` (ISO, fuso de Brasília), `legenda`, `midia` (URL pública do arquivo; carrossel = lista), `status` (`rascunho`, `aprovado`, `publicado`, `erro`), `aprovado_por`. A ferramenta `ferramentas/instagram-publicador` (no repositório) lê essa fila e **só publica itens `aprovado` cujo horário chegou**. Rascunho nunca é publicado.

**Regra de ouro: aprovação humana por padrão.** Uma pessoa da escola revisa o pacote do dia (5 minutos) e marca `aprovado`. Publicação 100% automática, sem revisão, só se o gestor pedir explicitamente, e mesmo assim com: lista de proibições acima, limite diário, pausa automática diante de erro e relatório diário.

## 5. Como publicar (opções, da mais simples à mais técnica)
1. **Agendador nativo** do Meta Business Suite / Instagram: cole legenda e mídia do pacote e programe. Sem código, sem token; Stories e algumas funções podem ter limites.
2. **API oficial de publicação do Instagram (Graph API)**: exige conta **profissional** (comercial/criador) vinculada ao app Meta, permissões de publicação e token. Fluxo em duas etapas: cria o contêiner de mídia e depois publica. Mídia precisa estar em **URL pública**. Há limite de publicações por 24 h e Reels/Stories têm exigências de formato e processamento; confirme na documentação oficial da Meta e na rota de quota da própria conta.
3. **Agendamento da rotina** (pesquisa e criação): tarefas agendadas do Claude/Claude Code geram o pacote do dia para aprovação. Elas **não substituem** o publicador.
Credenciais **só em variáveis de ambiente**, nunca em arquivo, repositório ou conversa. Nunca pedir senha do Instagram.

## 6. Saída padrão do dia
Resumo das trends (com links) → pacote do dia (tabela) → checklist de risco → fila JSON pronta para aprovação → o que depende de decisão humana. Depois, o relatório de resultados vem da `escola-instagram-monitor`.
