/**
 * Número de WhatsApp dedicado da escola — o mesmo registrado na API da Meta
 * (WHATSAPP_PHONE_NUMBER_ID). A família que envia "ACESSO" para ele recebe o acesso
 * automaticamente: como foi ela quem escreveu, a janela de 24h fica aberta e a resposta
 * em texto livre é entregue, sem depender de modelo aprovado. Sem dependências de
 * servidor: pode ser usado em páginas do navegador (login, esqueci a senha).
 */
export const NUMERO_WHATSAPP_ESCOLA = "5521992865778";

export const PALAVRA_PEDIDO_ACESSO = "ACESSO";

/** Link que abre o WhatsApp da família já com "ACESSO" escrito para o número da escola. */
export function linkPedirAcesso(): string {
  return `https://wa.me/${NUMERO_WHATSAPP_ESCOLA}?text=${encodeURIComponent(PALAVRA_PEDIDO_ACESSO)}`;
}

/** 5521992865778 → (21) 99286-5778 */
export const NUMERO_WHATSAPP_ESCOLA_FORMATADO = `(${NUMERO_WHATSAPP_ESCOLA.slice(2, 4)}) ${NUMERO_WHATSAPP_ESCOLA.slice(4, 9)}-${NUMERO_WHATSAPP_ESCOLA.slice(9)}`;
