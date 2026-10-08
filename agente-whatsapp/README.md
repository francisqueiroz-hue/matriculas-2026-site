# Lia — agente de WhatsApp (Espaço Kids e Instituto Fokus)

Worker da Cloudflare (TypeScript + D1) que atende o **número público** (21) 96469-9441. Não mexe no ClassLink nem no número interno. Visão geral: `docs/superpowers/specs/2026-10-08-agente-whatsapp-lia-design.md`.

## Antes de tudo
Leia `CANAL.md`: há pontos sobre a coexistência, o selo "IA ativa" e custos que **ainda não foram confirmados na Meta**. Não aponte o número público para a Lia antes de resolvê-los e de testar com um número de teste.

## Desenvolvimento
```bash
cd agente-whatsapp && npm install
npm test          # 126+ testes (banco em memória, sem rede)
npm run typecheck
npm run gerar:painel   # depois de editar painel/*
```

## Implantação (resumo; custo-alvo R$0 nos planos gratuitos)
1. `npx wrangler login` e `npx wrangler d1 create lia` → copie o `database_id` para `wrangler.toml`; escolha `MODELO` do Workers AI com bom português no catálogo atual.
2. `npx wrangler d1 migrations apply lia --remote`
3. Base inicial: `npm run semear > /tmp/semente.sql && npx wrangler d1 execute lia --remote --file /tmp/semente.sql` (preencha antes os itens `A_PREENCHER` em `conhecimento/`: endereço, horários, visitas).
4. Segredos (`npx wrangler secret put NOME`): `WHATSAPP_APP_SECRET`, `WHATSAPP_VERIFY_TOKEN`, `WHATSAPP_API_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID` (do número público), `MCP_TOKEN`, `DONO_EMAIL`, `ACCESS_TEAM_DOMAIN`, `ACCESS_AUD`, e as chaves de `npx tsx scripts/gerar-vapid.ts` (`VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`) mais `VAPID_SUBJECT` (`mailto:…`). Opcionais: `VAGAS_VISITA_TARDE` (vagas por dia de visita, padrão 3), `LIMITE_TOKENS_DIA`, `TELEFONE_ESCOLA`, `TELEFONES_IGNORADOS`, `TELEFONE_CLASSLINK`, `TEMPLATE_AVISO_EQUIPE` + `WHATSAPP_INTERNO_*` (aviso urgente), `ANTHROPIC_API_KEY` com `PROVEDOR=claude` e `MODELO=claude-haiku-5-5`.
5. `npx wrangler deploy`.
6. **Cloudflare Access** (gratuito) protegendo `/painel/*` e apenas o seu e-mail; copie o *Audience (AUD)* e o domínio do time para os segredos acima.
7. Webhook do número público: `WHATSAPP_API_TOKEN=… scripts/definir-webhook.sh <phone_number_id_público> https://<seu-worker>/webhook <VERIFY_TOKEN>` e assine, no app da Meta, os campos `messages` e (coexistência) `smb_message_echoes`.
8. Teste num número de teste: pergunta trivial responde; "mensalidade atrasada" só acolhe e abre chamado; digitar uma resposta no app pausa a Lia.
9. Revisão LGPD (dados de crianças, base legal, retenção de 90 dias, aviso de assistente virtual) antes do lançamento.

## Operação
- **Chave geral:** painel → "Lia ligada/desligada". **Pausar uma conversa:** "Assumir" no painel ou simplesmente responder pelo app.
- **MCP (administração pelo Claude):** `POST https://<worker>/mcp` com `Authorization: Bearer <MCP_TOKEN>`; ferramentas: buscar/adicionar conhecimento, listar/resolver chamados, listar/decidir sugestões.
- **Custos:** o painel mostra mensagens do mês vs. limite e tokens do dia; compare com o WhatsApp Manager ("Cobranças aproximadas").
