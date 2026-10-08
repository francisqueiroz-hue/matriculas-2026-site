---
name: agente-lia
description: Trabalha no agente de WhatsApp "Lia" da escola (Espaço Kids e Instituto Fokus), a pasta agente-whatsapp/. Use sempre que o assunto for a Lia, o WhatsApp público da escola, triagem de mensagens delicadas, base de conhecimento ou FAQ do atendimento, fila de chamados, agendamento de visitas, memória das famílias, painel do dono, custo/limite de mensagens, coexistência do número ou webhook da Meta — mesmo que o pedido não cite "Lia" (ex.: "a escola respondeu errado sobre matrícula", "adicionar horário de visita", "por que escalou essa mensagem").
---

# Agente Lia (agente-whatsapp/)

Cloudflare Worker (TypeScript) + D1 que atende o número público (21) 96469-9441 pela WhatsApp Cloud API. Independente do `classlink/`, que usa o número interno (21) 99286-5778 e **nunca** é tocado. Custo-alvo: zero (Workers AI), Claude opcional por variável. Spec: `docs/superpowers/specs/2026-10-08-agente-whatsapp-lia-design.md`. Plano: `docs/superpowers/plans/2026-10-08-agente-whatsapp-lia.md`.

## Regras que não se negociam (e por quê)

- **Triagem antes de qualquer resposta** (`src/triagem.ts`): cobrança, reclamação, bullying, saúde, laudo, cancelamento, desconto, jurídico, risco à criança e manipulação nunca recebem resposta de conteúdo, só acolhimento fixo + chamado com rascunho. Um erro aqui vira uma resposta errada a uma família em momento delicado. Na dúvida ou se o classificador falhar: escalar.
- **Só afirma o que está na base** (`src/agente.ts`): valor em R$, %, data que não esteja nos trechos recuperados é descartado e vira "vou confirmar" + chamado. Mensalidades **não são públicas**: a secretaria apresenta.
- **Uma resposta por turno**, texto livre só na janela de 24h. Cada resposta pode ser cobrada pela Meta após 1.000/mês (não confirmado oficialmente); `LIMITE_MENSAGENS_MES` corta o envio (0 é válido).
- **Equipe responde pelo app WhatsApp Business** (coexistência). O evento `smb_message_echoes` pausa a Lia na conversa por 12h. Respostas de dispositivos não suportados podem não gerar o evento: o painel tem "Assumir".
- **Horários (informados pelo dono em 2026-10-08):** escola 7h–19h; visitas à tarde, 13h–17h (dias úteis gerados sozinhos, `VAGAS_VISITA_TARDE`, padrão 3, a secretaria combina a hora exata); manhã 9h–11h só como exceção combinada pela equipe — a Lia nunca reserva manhã (`encaminhar_humano`, motivo `visita_manha`). Endereço ainda `A_PREENCHER`.
- **Sem dados pessoais na base compartilhada** e nada de CPF/e-mail na memória. Aprendizado é só sugestão: a publicação exige aprovação do dono.

## Como fazer as tarefas comuns

- **Adicionar/alterar resposta da base:** painel (aba Base), ou ferramenta MCP `adicionar_conhecimento`, ou `conhecimento/*.md` (`## Pergunta` + resposta) e `npm run semear`. Itens com `A_PREENCHER` não são semeados. Pergunta idêntica a uma da base sai como resposta pronta, sem IA.
- **Mudar a triagem:** edite `REGRAS` em `src/triagem.ts` (texto normalizado, sem acento), acrescente a frase em `test/triagem-casos.json` e espelhe em `conhecimento/triagem.md`. O teste exige vazamento = 0.
- **Mudar a persona:** edite `conhecimento/persona.md` e copie para `src/persona.ts` (o teste compara os dois).
- **Mudar o painel:** edite `painel/*` e rode `npm run gerar:painel` (o teste confere `src/painel-html.ts`).
- **Testar:** `cd agente-whatsapp && npm test && npm run typecheck`.
- **Implantar, webhook, coexistência, segredos:** `agente-whatsapp/README.md` e `agente-whatsapp/CANAL.md`.

Detalhes de arquitetura e do fluxo de um turno: `references/arquitetura.md`. Tudo que não foi confirmado em fonte oficial da Meta está listado em `agente-whatsapp/CANAL.md`: leia antes de afirmar algo sobre coexistência, preços ou dispositivos vinculados.
