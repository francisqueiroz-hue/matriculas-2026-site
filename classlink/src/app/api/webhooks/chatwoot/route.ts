import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { handleApiError } from "@/lib/http";
import { notifyUsers } from "@/lib/push";

interface ChatwootWebhookPayload {
  event?: string;
  id?: number;
  content?: string;
  message_type?: "incoming" | "outgoing" | "template" | "activity";
  conversation?: { id: number };
  sender?: { identifier?: string; type?: string };
  inbox?: { channel_type?: string };
}

/** Encontra/cria a conversa do ClassLink correspondente a uma conversa do Chatwoot, gravando o vínculo para as próximas mensagens. */
async function resolveConversation(chatwootConversationId: number, canal: "WHATSAPP" | "EMAIL", guardianId: string) {
  const campo = canal === "WHATSAPP" ? "chatwootConversationIdWpp" : "chatwootConversationIdMail";

  const existente = await prisma.conversation.findFirst({ where: { [campo]: chatwootConversationId } });
  if (existente) return existente;

  const guardian = await prisma.user.findFirst({ where: { id: guardianId, role: "GUARDIAN", deletedAt: null } });
  if (!guardian) return null;

  const ultima = await prisma.conversation.findFirst({ where: { guardianId }, orderBy: { createdAt: "desc" } });
  if (ultima) {
    return prisma.conversation.update({ where: { id: ultima.id }, data: { [campo]: chatwootConversationId } });
  }

  const admin = await prisma.user.findFirst({
    where: { schoolId: guardian.schoolId, role: "ADMIN", deletedAt: null },
    orderBy: { createdAt: "asc" },
  });
  if (!admin) return null;

  return prisma.conversation.create({
    data: { staffId: admin.id, guardianId, [campo]: chatwootConversationId },
  });
}

/**
 * Recebe eventos do Chatwoot (mensagens recebidas por WhatsApp/e-mail). Cadastre esta URL
 * como webhook da conta no Chatwoot com ?secret=CHATWOOT_WEBHOOK_SECRET (ver README) —
 * o Chatwoot open source não assina o payload, a segurança depende da URL ser secreta.
 */
export async function POST(request: NextRequest) {
  try {
    const secret = process.env.CHATWOOT_WEBHOOK_SECRET;
    if (!secret || request.nextUrl.searchParams.get("secret") !== secret) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    }

    const payload: ChatwootWebhookPayload = await request.json();

    if (payload.event !== "message_created" || payload.message_type !== "incoming") {
      return NextResponse.json({ ok: true });
    }
    if (payload.sender?.type !== "contact" || !payload.sender.identifier) {
      return NextResponse.json({ ok: true }); // sem identifier não dá pra saber de qual responsável é
    }
    if (!payload.conversation?.id || !payload.content) {
      return NextResponse.json({ ok: true });
    }

    const externalId = String(payload.id);
    const jaProcessada = await prisma.message.findUnique({ where: { externalId } });
    if (jaProcessada) return NextResponse.json({ ok: true });

    const canal: "WHATSAPP" | "EMAIL" = payload.inbox?.channel_type?.includes("Email") ? "EMAIL" : "WHATSAPP";
    const conversation = await resolveConversation(payload.conversation.id, canal, payload.sender.identifier);
    if (!conversation) return NextResponse.json({ ok: true });

    await prisma.message.create({
      data: {
        conversationId: conversation.id,
        senderId: payload.sender.identifier,
        body: payload.content,
        channel: canal,
        externalId,
      },
    });

    void notifyUsers([conversation.staffId], {
      title: `${canal === "WHATSAPP" ? "WhatsApp" : "E-mail"} recebido`,
      body: payload.content.slice(0, 120),
      url: `/dashboard/mensagens/${conversation.id}`,
    }).catch((err) => console.error("push notify failed", err));

    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
}
