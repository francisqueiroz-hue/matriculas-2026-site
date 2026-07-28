import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { handleApiError } from "@/lib/http";
import { notifyUsers } from "@/lib/push";
import { parseConversationIdFromRecipient, verifyMailgunSignature } from "@/lib/email";

function field(form: FormData, name: string): string {
  const value = form.get(name);
  return typeof value === "string" ? value : "";
}

/** Extrai só o endereço de um campo "Nome <email@dominio.com>" ou "email@dominio.com". */
function extractEmailAddress(value: string): string | null {
  const match = value.match(/<([^>]+)>/);
  const address = (match ? match[1] : value).trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address) ? address : null;
}

/**
 * Recebe respostas por e-mail via "Routes" do Mailgun. Configure uma rota que encaminhe
 * mensagens para conversa-*@SEU_DOMINIO a esta URL (ver README para o passo a passo).
 */
export async function POST(request: NextRequest) {
  try {
    const form = await request.formData();

    const timestamp = field(form, "timestamp");
    const token = field(form, "token");
    const signature = field(form, "signature");
    if (!verifyMailgunSignature(timestamp, token, signature)) {
      return NextResponse.json({ error: "Assinatura inválida" }, { status: 401 });
    }

    const recipient = field(form, "recipient");
    const conversationId = parseConversationIdFromRecipient(recipient);
    if (!conversationId) return NextResponse.json({ ok: true }); // não é um endereço de resposta reconhecido, ignora

    const conversation = await prisma.conversation.findUnique({
      where: { id: conversationId },
      include: { guardian: { select: { id: true, name: true, email: true } } },
    });
    if (!conversation) return NextResponse.json({ ok: true });

    const senderRaw = field(form, "sender") || field(form, "from");
    const senderEmail = extractEmailAddress(senderRaw);
    if (!senderEmail || senderEmail !== conversation.guardian.email.toLowerCase()) {
      console.warn(`E-mail recebido de remetente não confere com o responsável da conversa ${conversationId}: ${senderRaw}`);
      return NextResponse.json({ ok: true });
    }

    const externalId = field(form, "Message-Id") || field(form, "message-id") || `mailgun-${timestamp}-${token}`;
    const jaProcessada = await prisma.message.findUnique({ where: { externalId } });
    if (jaProcessada) return NextResponse.json({ ok: true });

    const corpo = (field(form, "stripped-text") || field(form, "body-plain")).trim();
    if (!corpo) return NextResponse.json({ ok: true });

    await prisma.message.create({
      data: { conversationId, senderId: conversation.guardian.id, body: corpo, channel: "EMAIL", externalId },
    });

    void notifyUsers([conversation.staffId], {
      title: `E-mail de ${conversation.guardian.name}`,
      body: corpo.slice(0, 120),
      url: `/dashboard/mensagens/${conversationId}`,
    }).catch((err) => console.error("push notify failed", err));

    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
}
