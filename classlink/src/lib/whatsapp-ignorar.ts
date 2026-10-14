/**
 * Tipos de evento do WhatsApp que não são mensagens para a equipe: uma reação (emoji em cima
 * de uma mensagem, ex.: 👍 na mensagem de boas-vindas) não pede resposta e não tem texto. Entrava
 * no ClassLink como `[Mensagem do tipo "reaction" recebida...]` e gerava aviso à toa.
 */
const TIPOS_IGNORADOS = new Set(["reaction"]);

export function mensagemIgnoravel(tipo: string): boolean {
  return TIPOS_IGNORADOS.has(tipo);
}
