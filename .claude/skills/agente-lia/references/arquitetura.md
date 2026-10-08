# Arquitetura da Lia (resumo)

Fluxo de um turno (`src/fluxo.ts`): webhook assinado → deduplica `wamid` → ignora outros `phone_number_id` e telefones da equipe → grava a mensagem → Lia ligada e não pausada? → espera 6 s e junta a rajada (só a chamada com o último id responde) → limite mensal → só mídia? pede texto → "ACESSO"/"SENHA"? orienta o canal do ClassLink, nunca envia senha → `triar` → acolher (texto fixo + chamado + rascunho + aviso ao dono) **ou** `responder` (busca FTS5, resposta pronta, ferramentas, guarda de saída) → envia, registra, conta.

Arquivos: webhook.ts (assinatura, ecos), triagem.ts, agente.ts, ferramentas.ts (telefone fixado pelo servidor; modelo nunca escolhe de quem lê/grava), mcp.ts (ferramentas administrativas, Bearer), conhecimento.ts (FTS5), memoria.ts (12 fatos/família), visitas.ts, conversa.ts (histórico, pausa, chave geral, 90 dias), push.ts (Web Push + aviso urgente por modelo WhatsApp), painel.ts + acesso.ts (Cloudflare Access), aprendizado.ts (cron), provedor.ts (Workers AI | Claude), limites.ts.

Banco: migrations/0001_init.sql e 0002_perguntas.sql. FTS5 mantida pelo código (sem gatilhos).
