import { formatarDataHora } from "@/lib/datas";

export type CanalEnvio = "APP" | "WHATSAPP" | "EMAIL";

/**
 * A Meta só entrega texto livre pelo WhatsApp nas 24h seguintes à última mensagem da pessoa.
 * Usamos 23h de margem para não depender de relógio e atraso do webhook.
 */
export const JANELA_CONVERSA_MS = 23 * 60 * 60 * 1000;

export interface JanelaWhatsApp {
  aberta: boolean;
  /** Até quando o texto livre ainda é entregue (null = a família nunca escreveu pelo WhatsApp). */
  ate: Date | null;
}

export function janelaWhatsApp(ultimaMensagemEm: Date | null | undefined, agora = Date.now()): JanelaWhatsApp {
  if (!ultimaMensagemEm) return { aberta: false, ate: null };
  const ate = new Date(ultimaMensagemEm.getTime() + JANELA_CONVERSA_MS);
  return { aberta: agora < ate.getTime(), ate };
}

export const MENSAGEM_JANELA_FECHADA =
  "O WhatsApp só entrega texto livre até 24 horas depois da última mensagem da família. " +
  "Envie pelo ClassLink (a família recebe uma notificação no celular) ou espere ela escrever.";

export const ROTULO_ENVIO: Record<CanalEnvio, string> = {
  APP: "Enviar pelo ClassLink",
  WHATSAPP: "Enviar pelo WhatsApp",
  EMAIL: "Enviar por e-mail",
};

/** Explicação curta, exibida embaixo do campo, do que acontece com o canal escolhido. */
export function explicacaoDoCanal(canal: CanalEnvio, janela: JanelaWhatsApp): string {
  if (canal === "APP") {
    return "A família recebe uma notificação no celular e lê no ClassLink. Você vê aqui quando ela abrir (✓✓ com data e hora).";
  }
  if (canal === "EMAIL") {
    return "Vai para o e-mail da família. O e-mail não informa se foi aberto.";
  }
  if (!janela.aberta || !janela.ate) {
    return "Indisponível: a família não escreveu pelo WhatsApp nas últimas 24 horas. Use o ClassLink.";
  }
  return `Chega no WhatsApp da família, pelo número da escola. Pode enviar até ${formatarDataHora(janela.ate)}. O WhatsApp não informa se foi lida.`;
}

/** Recibo da mensagem enviada por mim, conforme o canal: só o ClassLink comprova abertura. */
export function reciboPorCanal(canal: CanalEnvio | null, readAt: string | Date | null | undefined) {
  if (readAt) return { marca: "✓✓" as const, lida: true, texto: `Lida no ClassLink em ${formatarDataHora(readAt)}` };
  if (canal === "WHATSAPP") return { marca: "✓" as const, lida: false, texto: "Enviada pelo WhatsApp (leitura no WhatsApp não é acompanhada)" };
  if (canal === "EMAIL") return { marca: "✓" as const, lida: false, texto: "Enviada por e-mail (abertura não é acompanhada)" };
  return { marca: "✓" as const, lida: false, texto: "Enviada — ainda não aberta" };
}
