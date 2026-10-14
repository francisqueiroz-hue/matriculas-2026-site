import { prisma } from "@/lib/prisma";
import { conversaDaFamiliaComGestao } from "@/lib/permissoes-mensagens";

/** Boas-vindas dentro do app, no primeiro acesso do responsável (chega em Mensagens, assinada pela escola). */
export const TEXTO_BOAS_VINDAS_APP =
  "Que bom que você baixou o nosso aplicativo! 😊\n\n" +
  "Aqui você acompanha os avisos, a agenda, o cardápio e as novidades da turma do seu filho, " +
  "e pode falar com a escola por esta conversa sempre que precisar.";

/** Frase final da resposta ao pedido de "ACESSO" pelo WhatsApp. */
export const TEXTO_BOAS_VINDAS_WHATSAPP = "Baixe o nosso aplicativo e aproveite para interagir com a escola do seu filho! 📲";

/** Chave única da mensagem: garante que cada responsável recebe as boas-vindas só uma vez. */
export function chaveBoasVindas(userId: string): string {
  return `boas-vindas-app:${userId}`;
}

/**
 * Primeiro acesso = responsável que nunca teve sessão (nenhum refresh token, nem revogado).
 * Quem já usa o app não recebe boas-vindas atrasadas. Qualquer erro vira "não é primeiro acesso":
 * boas-vindas são um extra e nunca podem atrapalhar o login.
 */
export async function ehPrimeiroAcesso(user: { id: string; role: string }): Promise<boolean> {
  if (user.role !== "GUARDIAN") return false;
  try {
    return (await prisma.refreshToken.count({ where: { userId: user.id } })) === 0;
  } catch (err) {
    console.error("boas-vindas: não foi possível checar o primeiro acesso", err);
    return false;
  }
}

/** Grava a mensagem de boas-vindas na conversa da família com a gestão. Nunca lança erro. */
export async function enviarBoasVindasApp(user: { id: string; schoolId: string }): Promise<void> {
  try {
    const externalId = chaveBoasVindas(user.id);
    if (await prisma.message.findUnique({ where: { externalId }, select: { id: true } })) return;

    const conversationId = await conversaDaFamiliaComGestao(user.id, user.schoolId);
    if (!conversationId) return;
    const conversa = await prisma.conversation.findUnique({ where: { id: conversationId }, select: { staffId: true } });
    if (!conversa) return;

    await prisma.message.create({
      data: { conversationId, senderId: conversa.staffId, body: TEXTO_BOAS_VINDAS_APP, channel: "APP", externalId },
    });
  } catch (err) {
    console.error("boas-vindas: falha ao enviar a mensagem", err);
  }
}
