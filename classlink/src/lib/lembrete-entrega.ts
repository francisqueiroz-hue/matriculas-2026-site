/**
 * Situação de entrega do último lembrete enviado pelo WhatsApp, para a tela Gestão › Lembretes.
 * A Meta aceita o envio e depois avisa, pelo webhook, se entregou, se a família leu ou se falhou.
 * Sem aviso de entrega depois de um dia, vale conferir com a família por outro meio.
 */

export type StatusEntrega = "ENVIADO" | "ENTREGUE" | "LIDO" | "FALHOU";

export interface SituacaoEntrega {
  status: StatusEntrega;
  em: string | null;
  /** Motivo da falha, já explicado (só em "FALHOU"). */
  motivo: string | null;
  /** Enviado há mais de HORAS_SEM_CONFIRMACAO sem aviso de entrega. */
  semConfirmacao: boolean;
}

export const HORAS_SEM_CONFIRMACAO = 24;

const VALIDOS = new Set<string>(["ENVIADO", "ENTREGUE", "LIDO", "FALHOU"]);

export function situacaoEntrega(
  r: { ultimoEnvioStatus: string | null; ultimoEnvioStatusEm: Date | null; ultimoEnvioFalha: string | null } | undefined,
  agora = new Date(),
): SituacaoEntrega | null {
  if (!r?.ultimoEnvioStatus || !VALIDOS.has(r.ultimoEnvioStatus)) return null;
  const status = r.ultimoEnvioStatus as StatusEntrega;
  const em = r.ultimoEnvioStatusEm;
  const semConfirmacao = status === "ENVIADO" && !!em && agora.getTime() - em.getTime() > HORAS_SEM_CONFIRMACAO * 3_600_000;
  return { status, em: em ? em.toISOString() : null, motivo: status === "FALHOU" ? r.ultimoEnvioFalha : null, semConfirmacao };
}

export const ROTULO_ENTREGA: Record<StatusEntrega, string> = {
  ENVIADO: "WhatsApp enviado, aguardando entrega",
  ENTREGUE: "WhatsApp entregue",
  LIDO: "WhatsApp lido",
  FALHOU: "WhatsApp não entregue",
};
