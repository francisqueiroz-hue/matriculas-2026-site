import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { handleApiError } from "@/lib/http";
import { notifyUsers } from "@/lib/push";
import { findGuardianByPhone, verifyWhatsAppSignature } from "@/lib/whatsapp";

/** Handshake de verificação exigido pela Meta ao cadastrar a URL do webhook no Meta Developer Console. */
export async function GET(request: NextRequest) {
  const mode = request.nextUrl.searchParams.get("hub.mode");
  const token = request.nextUrl.searchParams.get("hub.verify_token");
  const challenge = request.nextUrl.searchParams.get("hub.challenge");

  if (mode === "subscribe" && token === process.env.WHATSAPP_VERIFY_TOKEN && challenge) {
    return new NextResponse(challenge, { status: 200 });
  }
  return NextResponse.json({ error: "Verificação falhou" }, { status: 403 });
}

interface WhatsAppMessage {
  from: string;
  id: string;
  timestamp: string;
  type: string;
  text?: { body: string };
  context?: { id: string };
}

interface WhatsAppWebhookPayload {
  entry?: {
    changes?: {
      field: string;
      value?: { messages?: WhatsAppMessage[] };
    }[];
  }[];
}

/** Encontra a conversa de destino: pelo contexto de resposta direta, ou a mais recente do responsável, ou uma nova com a direção. */
async function resolveConversationId(guardianId: string, schoolId: string, context?: { id: string }) {
  if (context?.id) {
    const original = await prisma.message.findUnique({ where: { externalId: context.id }, select: { conversationId: true } });
    if (original) return original.conversationId;
  }

  const ultima = await prisma.conversation.findFirst({
    where: { guardianId },
    orderBy: { createdAt: "desc" },
  });
  if (ultima) return ultima.id;

  const admin = await prisma.user.findFirst({ where: { schoolId, role: "ADMIN", deletedAt: null }, orderBy: { createdAt: "asc" } });
  if (!admin) return null;

  const nova = await prisma.conversation.create({ data: { staffId: admin.id, guardianId } });
  return nova.id;
}

export async function POST(request: NextRequest) {
  try {
    const rawBody = await request.text();

    if (!verifyWhatsAppSignature(rawBody, request.headers.get("x-hub-signature-256"))) {
      return NextResponse.json({ error: "Assinatura inválida" }, { status: 401 });
    }

    const payload: WhatsAppWebhookPayload = JSON.parse(rawBody);
    const mensagens = (payload.entry ?? [])
      .flatMap((entry) => entry.changes ?? [])
      .filter((change) => change.field === "messages")
      .flatMap((change) => change.value?.messages ?? []);

    for (const msg of mensagens) {
      const jaProcessada = await prisma.message.findUnique({ where: { externalId: msg.id } });
      if (jaProcessada) continue;

      const guardian = await findGuardianByPhone(msg.from);
      if (!guardian) {
        console.warn(`Mensagem WhatsApp recebida de número não cadastrado: ${msg.from}`);
        continue;
      }

      const conversationId = await resolveConversationId(guardian.id, guardian.schoolId, msg.context);
      if (!conversationId) continue;

      const corpo = msg.type === "text" ? (msg.text?.body ?? "") : `[Mensagem do tipo "${msg.type}" recebida no WhatsApp — abra o WhatsApp da escola para ver o conteúdo]`;
      if (!corpo) continue;

      await prisma.message.create({
        data: { conversationId, senderId: guardian.id, body: corpo, channel: "WHATSAPP", externalId: msg.id },
      });

      const conversation = await prisma.conversation.findUniqueOrThrow({ where: { id: conversationId } });
      void notifyUsers([conversation.staffId], {
        title: `WhatsApp de ${guardian.name}`,
        body: corpo.slice(0, 120),
        url: `/dashboard/mensagens/${conversationId}`,
      }).catch((err) => console.error("push notify failed", err));
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
}
