# Agente de WhatsApp "Lia" — Especificação de desenho

Data: 2026-10-08 · Status: **aguardando revisão do responsável** · Pasta de código prevista: `agente-whatsapp/` (independente do `classlink/`)

## 1. Objetivo

Um agente que atende pelo número de WhatsApp Business da escola (Espaço Kids e Instituto Fokus), 24h por dia, sem depender do computador do gestor e sem exigir aplicativo das famílias. Ele:

- responde dúvidas triviais de famílias atuais e de interessados em matrícula;
- agenda visitas;
- lembra o contexto de cada família de forma natural;
- melhora com o histórico de conversas, **com aprovação humana** antes de publicar qualquer aprendizado;
- encaminha à equipe o que for delicado, **sem responder o conteúdo**.

**Restrição principal: custo próximo de zero.** Qualidade e segurança não podem ser sacrificadas por isso; o que for pago só entra com aviso e com números.

## 2. Premissas e decisões já tomadas

| Decisão | Escolha |
|---|---|
| Canal | WhatsApp Cloud API (oficial, Meta), **no número público (21) 96469-9441**. O número interno do ClassLink não muda. open-wa descartado: não oficial, risco de banimento. |
| Persona | Um único agente, "Lia", assistente virtual do Espaço Kids e do Instituto Fokus. Sempre se identifica como assistente virtual. |
| Mensagens delicadas | **Duas ações juntas:** acolhimento automático e curto + rascunho de resposta na fila para um humano aprovar. |
| Aprendizado | Sugerido automaticamente, **publicado só após aprovação** da coordenação. |
| Modelo de IA | Começa em **Workers AI (R$0)**, atrás de uma interface de provedor. Troca por Claude Haiku 5.5 é só configuração. Gemini free tier **descartado** (Google pode usar os prompts do plano gratuito para melhorar produtos; inaceitável com dados de crianças — LGPD). |
| Hospedagem | Cloudflare Workers + D1 (plano gratuito). Sem Vectorize/embeddings: busca por FTS5 do D1. |
| Escopo de conteúdo | Só assuntos da escola. Fora disso, recusa educadamente (política da Meta permite bots de atendimento, não assistentes genéricos). |

## 3. Custos (verificado vs. não verificado)

- **WhatsApp:** fontes secundárias indicam que, desde 01/10/2026, respostas de serviço são cobradas após **1.000 por número/mês** (cerca de R$0,035 por mensagem no Brasil). **Não confirmado na página oficial da Meta** (acesso bloqueado na sessão). Mitigação: uma resposta consolidada por turno, contador mensal e limite configurável; confirmar o valor na Meta antes de ir ao ar.
- **Cloudflare:** Workers Free (100 mil req/dia; CPU de 10 ms por requisição — chamadas de rede não contam como CPU) e Workers AI com 10 mil neurons/dia. Limites do D1 **não confirmados** em fonte oficial; conferir antes de depender deles.
- **Claude Haiku 5.5 (opcional):** cerca de US$0,50/mês para ~1.000 respostas (estimativa; US$0,10/MTok entrada, US$0,50/MTok saída).

## 4. Arquitetura

```
Famílias → WhatsApp Cloud API → Worker "lia"
  1. valida assinatura (X-Hub-Signature-256), confere phone_number_id e deduplica por wamid
  2. identifica contato (família atual / interessado novo / equipe)
  3. TRIAGEM  ──► delicado → acolhimento + rascunho na Fila  (fim)
        │
        └─ trivial → agente (ferramentas MCP) → resposta única → WhatsApp
  4. grava memória e métricas
Cron noturno: agrupa perguntas repetidas → sugere itens da base → Fila
Painel "Fila da Lia" (Cloudflare Pages + Access): aprovar/editar rascunhos e base
```

### 4.1 Módulos (cada um com uma responsabilidade e testável sozinho)

- `webhook`: assinatura, deduplicação, resposta 200 imediata; o restante roda em `waitUntil`.
- `contatos`: normalização de telefone brasileiro (com/sem nono dígito — mesma regra já usada no ClassLink), resolução do tipo de contato.
- `triagem`: regras duras + classificador (ver 5).
- `agente`: monta o prompt mínimo, chama o provedor, executa as ferramentas, valida a saída.
- `provedor`: interface única `gerar(mensagens, ferramentas)`; implementações `workers-ai` e `claude`.
- `mcp`: servidor MCP no mesmo Worker expondo as ferramentas abaixo.
- `memoria`: perfil por família e base de conhecimento.
- `fila`: chamados de handoff, rascunhos e sugestões de base.
- `limites`: contador de mensagens do mês e de neurons do dia, com corte seguro.

### 4.2 Ferramentas MCP

`buscar_conhecimento(consulta)`, `ler_memoria_familia()`, `salvar_fato_familia(fato)`, `consultar_horarios_visita()`, `reservar_visita(data, turno, serie)`, `encaminhar_humano(motivo, resumo, prioridade)`.
O mesmo servidor permite ao gestor administrar a base e a fila pelo Claude, de qualquer lugar.

### 4.3 Dois números, dois papéis (informado pelo responsável em 2026-10-08)

| Número | Papel | Webhook |
|---|---|---|
| **(21) 99286-5778** | Interno, usado pelo ClassLink, não divulgado às famílias | Continua exatamente como está (`classlink/src/app/api/webhooks/whatsapp/route.ts`). **Não é alterado.** |
| **(21) 96469-9441** | Público, divulgado como WhatsApp da escola | **Lia atende aqui.** |

Ambos já estão aprovados na Meta. Como a Meta escolhe o destino do webhook primeiro pelo **número** (override por número, depois WABA, depois app — [documentação da Meta](https://developers.facebook.com/documentation/business-messaging/whatsapp/webhooks/override/)), basta configurar para o número público um `override_callback_uri` apontando ao Worker. O ClassLink segue recebendo só o tráfego do número interno e **deixa de ser um risco**. Salvaguarda extra: o Worker confere `metadata.phone_number_id` no payload e ignora qualquer mensagem que não seja do número público.

A tabela de envio do ClassLink (convites, senhas e avisos pelo número interno) não muda.

**Pergunta crítica em aberto (bloqueia a implantação, não o desenho):** em que modo o número público está hoje?
- **Já na Cloud API:** a Lia assume. Quem atende hoje (se alguém) passa a usar a Fila da Lia.
- **No app WhatsApp Business no celular:** a Cloud API normalmente exige tirar o número do app. A alternativa é o modo *coexistência*, em que app e API funcionam juntos (exige app atualizado, onboarding por QR e abrir o app ao menos a cada 13 dias; conforme provedores — [Kapso](https://kapso.ai/blog/whatsapp-business-app-coexistence-cloud-api), [8x8](https://developer.8x8.com/connect/docs/whatsapp/whatsapp-business-app-coexistence); **não confirmado em documentação oficial da Meta**). Com coexistência, a equipe continua conversando pelo app e a Lia responde pela API.

## 5. Triagem antes de qualquer resposta

1. **Regras duras** (lista em `conhecimento/triagem.md`): inadimplência/cobrança, reclamação, bullying/agressão, saúde/medicação/alergia, laudo e necessidades especiais, cancelamento/transferência, desconto/negociação, jurídico/ameaça, qualquer risco à criança, pedidos de dados de outras pessoas.
2. **Classificador** devolve `{categoria, risco, confiança}`. Abaixo do limiar de confiança ou risco médio/alto = delicado.
3. **Decisão:**
   - trivial → agente responde;
   - delicado → mensagem de acolhimento fixa (sem conteúdo inventado) + chamado com resumo e rascunho na Fila;
   - emergência/risco à criança → acolhimento + alerta imediato à equipe.
4. **Guardas de saída:** a resposta só afirma preço, data ou regra que esteja na base recuperada; sem base = "vou confirmar com a equipe" + chamado.

## 6. Memória e naturalidade

- **Perfil por família (privado):** fatos curtos e datados (série do filho, turno preferido, assunto da última conversa). Máximo de itens por família, com esquecimento do que ficou obsoleto.
- **Base de conhecimento (compartilhada):** respostas validadas, **sem dados pessoais**, em D1/FTS5.
- Estilo: retoma o contexto, não repete cumprimento nem refaz pergunta já respondida, mensagens curtas, português do Brasil informal e acolhedor.
- Isolamento: nenhum dado de uma família entra no contexto de outra; fatos pessoais nunca vão para a base compartilhada.

## 6A. Quem atende e quem administra (informado em 2026-10-08)

- **Equipe:** um único celular da escola, respondendo **direto pelo aplicativo WhatsApp Business** no número público. Isso exige o modo de **coexistência** (app + Cloud API no mesmo número). Quando a equipe responde, a Meta avisa o Worker (evento `smb_message_echoes`) e a Lia **pausa naquela conversa por 12 horas**. Requisitos (app atualizado, abrir o app ao menos a cada 13 dias, onboarding por fluxo próprio de coexistência, necessidade de reintegrar um número que já esteja na Cloud API) vêm de fontes de terceiros e **precisam ser confirmados na documentação oficial da Meta**. Plano B: resposta pelo painel.
- **Dono (1 pessoa):** painel responsivo para computador e celular, protegido por **Cloudflare Access** (login por e-mail/Google) com validação do JWT no Worker. Aprova a base, acompanha chamados, custos e conversas, pausa/retoma a Lia por conversa e tem uma **chave geral para desligar a Lia**.
- Avisos ao dono: Web Push (gratuito); aviso por WhatsApp ao celular da escola só em casos urgentes (modelo fora da janela de 24h é cobrado).
- Histórico guardado por 90 dias e depois apagado.

## 7. Aprendizado supervisionado

Cron noturno agrupa perguntas parecidas e sem resposta firme, propõe um item de base com a resposta sugerida e a frequência. A coordenação aprova, edita ou rejeita na Fila. Só itens aprovados entram na recuperação.

## 8. Economia de tokens (uso do `skill-creator`)

Princípio: **uma única fonte de verdade em arquivos pequenos, carregada sob demanda**, igual à divulgação progressiva de uma skill.

- Pasta `agente-whatsapp/conhecimento/` com arquivos curtos e independentes: `persona.md`, `triagem.md`, `visitas.md`, `matriculas.md`, `rotina-familias.md`, etc.
- **Em tempo de desenvolvimento:** o `skill-creator` cria a skill de projeto `.claude/skills/agente-lia/` (descrição curta e "insistente" para disparar quando se falar da Lia, WhatsApp, triagem ou base). O corpo da skill tem o essencial e aponta para os arquivos de `conhecimento/`; as sessões futuras só carregam o que precisam.
- **Em tempo de execução:** o prompt do agente = `persona` (fixa, pequena e cacheável) + apenas os 3–5 trechos da base devolvidos pelo FTS5 + o perfil da família. Nunca a base inteira.
- A skill é testada com o fluxo de avaliação do `skill-creator` (casos de teste com e sem a skill, comparando acerto e tokens) e a descrição é otimizada no final.
- Respostas a perguntas muito frequentes e inequívocas (horário, endereço) usam **respostas prontas sem chamar o modelo** (custo zero de IA).

## 9. LGPD e segurança

- Dados de crianças: minimização, base legal e política de retenção a revisar com `legal:compliance-check` antes do lançamento; aviso de assistente virtual na primeira mensagem; opção de falar com humano a qualquer momento.
- Pseudonimização do nome da criança nos prompts quando o provedor não for o Claude pago.
- Segredos só em variáveis do Worker (nunca no repositório); validação da assinatura da Meta; limite de taxa por contato; painel atrás do Cloudflare Access.
- Janela de 24h: fora dela, só modelos aprovados (já existentes no ClassLink).

## 10. Testes e critérios de aceite

- Triagem: conjunto de frases reais por categoria; **nenhum** caso delicado pode receber resposta de conteúdo (taxa de vazamento = 0 no conjunto).
- Webhook: assinatura inválida rejeitada; reentrega deduplicada; mensagem de `phone_number_id` diferente do número público é ignorada.
- Telefone: variantes com e sem o nono dígito.
- Agente: respostas ancoradas na base; sem base = escala; não inventa preço ou data.
- Visitas: sem conflito de horário; confirmação e lembrete dentro da janela.
- Custo: contador de mensagens do mês corta o envio no limite configurado.
- Verificação final com o simulador de webhook, sem tráfego real, antes de apontar o número da escola.

## 11. Fora do escopo agora

Envio ativo em massa, cobrança automática, áudios/imagens (a Lia pede texto e escala), integração de notas/boletos do ClassLink (fase 2, exige autenticação forte da família).

## 12. Perguntas em aberto (não bloqueiam o plano)

0. Modo atual do número público (Cloud API ou app Business) — ver 4.3.
1. Valores oficiais de mensagens de serviço no Brasil (conferir na Meta).
2. Limites oficiais do D1 e do Workers AI para o volume real da escola.
3. Horários de visita, endereço, valores e documentos de matrícula: fornecidos pela escola para semear a base.
