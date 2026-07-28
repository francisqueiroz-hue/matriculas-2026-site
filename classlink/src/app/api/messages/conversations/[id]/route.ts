import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/session";
import { handleApiError } from "@/lib/http";
import { assertConversationParticipant } from "@/lib/messaging";
import { sendMessageSchema } from "@/lib/validators";
import { notifyUsers } from "@/lib/push";
import {
  fetchChatwootIncomingMessages,
  isChatwootChannelConfigured,
  isChatwootConfigured,
  normalizePhoneBR,
  sendChatwootMessage,
} from "@/lib/chatwoot";

/**
 * Busca mensagens novas do responsável no Chatwoot e grava as que ainda não existem.
 * Substitui o webhook (recurso pago no Chatwoot Cloud) por polling: como esta rota já é
 * chamada a cada poucos segundos pela tela de conversa aberta, isso basta para dar a
 * sensação de tempo real sem depender de plano pago nem de um cron externo.
 */
async function sincronizarChatwoot(conversation: {
  id: string;
  guardianId: string;
  chatwootConversationIdWpp: number | null;
  chatwootConversationIdMail: number | null;
}) {
  if (!isChatwootConfigured()) return;

  const canais: [number | null, "WHATSAPP" | "EMAIL"][] = [
    [conversation.chatwootConversationIdWpp, "WHATSAPP"],
    [conversation.chatwootConversationIdMail, "EMAIL"],
  ];

  for (const [chatwootConversationId, canal] of canais) {
    if (!chatwootConversationId) continue;
    try {
      const recebidas = await fetchChatwootIncomingMessages(chatwootConversationId);
      for (const msg of recebidas) {
        const existente = await prisma.message.findUnique({ where: { externalId: msg.externalId } });
        if (existente) continue;
        await prisma.message.create({
          data: {
            conversationId: conversation.id,
            senderId: conversation.guardianId,
            body: msg.content,
            channel: canal,
            externalId: msg.externalId,
          },
        });
      }
    } catch (error) {
      console.error(`Falha ao sincronizar mensagens do Chatwoot (${canal})`, error);
    }
  }
}

export async function GET(_request: NextRequest, ctx: RouteContext<"/api/messages/conversations/[id]">) {
  try {
    const session = await requireSession();
    const { id } = await ctx.params;
    const participante = await assertConversationParticipant(id, session.sub);

    await sincronizarChatwoot(participante);

    const [conversation, messages] = await Promise.all([
      prisma.conversation.findUniqueOrThrow({
        where: { id },
        include: {
          staff: { select: { id: true, name: true, role: true } },
          guardian: { select: { id: true, name: true, phone: true, email: true } },
        },
      }),
      prisma.message.findMany({
        where: { conversationId: id },
        orderBy: { createdAt: "asc" },
        include: { sender: { select: { id: true, name: true, role: true } } },
      }),
    ]);

    await prisma.message.updateMany({
      where: { conversationId: id, senderId: { not: session.sub }, readAt: null },
      data: { readAt: new Date() },
    });

    return NextResponse.json({ conversation, messages });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: NextRequest, ctx: RouteContext<"/api/messages/conversations/[id]">) {
  try {
    const session = await requireSession();
    const { id } = await ctx.params;
    const conversation = await assertConversationParticipant(id, session.sub);
    const { body, channel } = sendMessageSchema.parse(await request.json());

    // WhatsApp/e-mail só fazem sentido enviados pela equipe ao responsável — o responsável
    // já está na conversa via app, e essas mensagens sempre partem de quem está na tela do ClassLink.
    const canalEfetivo = channel && channel !== "APP" && session.sub === conversation.staffId ? channel : "APP";

    let externalId: string | undefined;
    if (canalEfetivo === "WHATSAPP" || canalEfetivo === "EMAIL") {
      if (!isChatwootChannelConfigured(canalEfetivo)) {
        return NextResponse.json({ error: `Integração com ${canalEfetivo === "WHATSAPP" ? "WhatsApp" : "e-mail"} não configurada` }, { status: 400 });
      }
      const guardian = await prisma.user.findUniqueOrThrow({
        where: { id: conversation.guardianId },
        select: { id: true, name: true, phone: true, email: true },
      });

      let sourceId: string;
      if (canalEfetivo === "WHATSAPP") {
        const phone = guardian.phone ? normalizePhoneBR(guardian.phone) : null;
        if (!phone) return NextResponse.json({ error: "Responsável não tem telefone cadastrado" }, { status: 400 });
        sourceId = phone;
      } else {
        sourceId = guardian.email;
      }

      const sent = await sendChatwootMessage({ canal: canalEfetivo, guardian, sourceId, content: body });
      externalId = sent.externalId;

      await prisma.conversation.update({
        where: { id },
        data:
          canalEfetivo === "WHATSAPP"
            ? { chatwootContactId: sent.contactId, chatwootConversationIdWpp: sent.conversationId }
            : { chatwootContactId: sent.contactId, chatwootConversationIdMail: sent.conversationId },
      });
    }

    const message = await prisma.message.create({
      data: { conversationId: id, senderId: session.sub, body, channel: canalEfetivo, externalId },
      include: { sender: { select: { id: true, name: true, role: true } } },
    });

    const recipientId = conversation.staffId === session.sub ? conversation.guardianId : conversation.staffId;
    if (canalEfetivo === "APP") {
      void notifyUsers([recipientId], {
        title: `Nova mensagem de ${message.sender.name}`,
        body: body.slice(0, 120),
        url: `/dashboard/mensagens/${id}`,
      }).catch((err) => console.error("push notify failed", err));
    }

    return NextResponse.json({ message }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
