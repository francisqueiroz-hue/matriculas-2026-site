import { prisma } from "@/lib/prisma";
import { getNoticeTemplate, isWhatsAppConfigured, normalizePhoneBR, sendWhatsAppTemplateMessage } from "@/lib/whatsapp";

/** Uma conversa com várias mensagens seguidas gera no máximo um aviso nesse intervalo. */
export const INTERVALO_ENTRE_AVISOS_MS = 10 * 60 * 1000;
const LIMITE_TRECHO = 300;

export function avisosWhatsAppDisponiveis(): boolean {
  return isWhatsAppConfigured() && getNoticeTemplate() !== null;
}

export function trechoAviso(texto: string): string {
  const limpo = texto.replace(/\s+/g, " ").trim();
  return limpo.length > LIMITE_TRECHO ? `${limpo.slice(0, LIMITE_TRECHO - 1)}…` : limpo;
}

/** Parâmetros do modelo de aviso, na ordem {{1}} remetente, {{2}} trecho, {{3}} link. */
export function parametrosModeloAviso(remetente: string, texto: string, link: string): string[] {
  return [remetente, trechoAviso(texto), link];
}

interface NovaMensagem {
  destinatarioId: string;
  remetente: string;
  texto: string;
  /** Link absoluto para abrir a conversa no ClassLink. */
  link: string;
  /** Conversa com família (Message) ou interna da equipe (TeamMessage). */
  tipo: "familia" | "equipe";
  conversationId: string;
  mensagemId: string;
}

/**
 * Avisa um membro da equipe (ADMIN/STAFF) no WhatsApp pessoal, pelo número da escola,
 * que chegou mensagem nova no ClassLink — só se ele ativou isso em Conta, tem celular
 * cadastrado e o modelo aprovado está configurado. Se já houver outra mensagem não lida
 * recente na mesma conversa, não repete o aviso (evita uma mensagem de WhatsApp por
 * frase). Nunca lança erro: aviso é um extra e não pode atrapalhar o envio da mensagem.
 */
export async function avisarEquipePorWhatsApp(msg: NovaMensagem): Promise<boolean> {
  try {
    const template = getNoticeTemplate();
    if (!isWhatsAppConfigured() || !template) return false;

    const destinatario = await prisma.user.findUnique({
      where: { id: msg.destinatarioId },
      select: { role: true, phone: true, avisosWhatsApp: true, active: true, deletedAt: true },
    });
    if (!destinatario || destinatario.role === "GUARDIAN" || !destinatario.avisosWhatsApp) return false;
    if (!destinatario.active || destinatario.deletedAt) return false;
    const telefone = destinatario.phone ? normalizePhoneBR(destinatario.phone) : null;
    if (!telefone) return false;

    const desde = new Date(Date.now() - INTERVALO_ENTRE_AVISOS_MS);
    const filtro = {
      conversationId: msg.conversationId,
      senderId: { not: msg.destinatarioId },
      readAt: null,
      createdAt: { gte: desde },
      id: { not: msg.mensagemId },
    };
    const recentes =
      msg.tipo === "familia" ? await prisma.message.count({ where: filtro }) : await prisma.teamMessage.count({ where: filtro });
    if (recentes > 0) return false;

    await sendWhatsAppTemplateMessage(telefone, template, parametrosModeloAviso(msg.remetente, msg.texto, msg.link));
    return true;
  } catch (err) {
    console.error("Falha ao avisar equipe pelo WhatsApp", err);
    return false;
  }
}
