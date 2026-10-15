# Publicador de fila do Instagram

Lê uma fila JSON e publica pela Graph API **apenas** itens com `status: aprovado`, `aprovado_por` preenchido e horário já vencido. Para no primeiro erro e respeita a cota da conta.

- Requisitos: Python 3, conta Instagram **profissional** vinculada a um app Meta com permissão de publicação, mídia em URL pública https.
- Variáveis de ambiente (nunca em arquivo): `IG_USER_ID`, `IG_ACCESS_TOKEN`, `IG_GRAPH_VERSION` (confirme na documentação da Meta) e, opcional, `IG_GRAPH_HOST` (`graph.facebook.com` padrão; `graph.instagram.com` com Login do Instagram). Passo a passo do app: `PASSO-A-PASSO-APP-META.md`.
- Simular: `python3 publish.py fila.json --dry-run`
- Publicar: `python3 publish.py fila.json` (agende com cron do servidor a cada 15 min)
- Testes: `python3 -m unittest -v test_publish`

**Status de teste:** os testes cobrem a lógica (aprovação, horário, validação, montagem das chamadas) com a API simulada. **Não foi testado contra a API real do Instagram**: faça o primeiro teste em conta de homologação, com um item e `--max 1`.
