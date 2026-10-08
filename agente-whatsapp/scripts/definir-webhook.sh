#!/usr/bin/env bash
# Aponta o webhook do NÚMERO PÚBLICO para o Worker (override por número; o do ClassLink não muda).
# Uso: WHATSAPP_API_TOKEN=... ./definir-webhook.sh <PHONE_NUMBER_ID_PUBLICO> <URL_DO_WORKER>/webhook <VERIFY_TOKEN>
# Conferir a versão atual da Graph API na documentação da Meta antes de rodar.
set -euo pipefail
[ $# -eq 3 ] || { echo "uso: $0 <PHONE_NUMBER_ID> <URL> <VERIFY_TOKEN>" >&2; exit 2; }
: "${WHATSAPP_API_TOKEN:?defina WHATSAPP_API_TOKEN}"
VERSAO="${GRAPH_VERSAO:-v21.0}"
curl -sS -X POST "https://graph.facebook.com/${VERSAO}/$1" \
  -H "Authorization: Bearer ${WHATSAPP_API_TOKEN}" -H "Content-Type: application/json" \
  -d "{\"webhook_configuration\":{\"override_callback_uri\":\"$2\",\"verify_token\":\"$3\"}}"
echo
