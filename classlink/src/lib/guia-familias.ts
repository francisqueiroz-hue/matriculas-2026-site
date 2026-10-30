/** Textos para divulgar o Guia do app (/guia) às famílias. Sem dependências de servidor. */
export const TITULO_GUIA = "Guia do ClassLink: instale o app e saiba usar cada área";

export function textoComunicadoGuia(link: string): string {
  return [
    "Preparamos um guia rápido do ClassLink para as famílias:",
    "• como instalar o app no celular (Android ou iPhone) ou no computador;",
    "• como ativar os avisos para não perder nenhuma mensagem;",
    "• o que tem em cada área (Comunicados, Mensagens, Financeiro, Contratos…);",
    "• como pedir declarações e enviar documentos pela área Mensagens.",
    "",
    `Acesse: ${link}`,
    "",
    "O guia também fica no menu do app, em \"Guia do app\".",
  ].join("\n");
}

export function textoWhatsAppGuia(link: string): string {
  return `Olá, família! Preparamos um guia rápido do ClassLink: como instalar no celular, ativar os avisos, usar cada área e pedir declarações pelas Mensagens. Acesse: ${link}`;
}
