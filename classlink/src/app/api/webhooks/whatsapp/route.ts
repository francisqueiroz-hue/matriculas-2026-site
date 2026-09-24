import { NextRequest, NextResponse, after } from "next/server";
import { avisarEquipePorWhatsApp } from "@/lib/avisos-equipe";
import { prisma } from "@/lib/prisma";
import { handleApiError } from "@/lib/http";
import { notifyUsers } from "@/lib/push";
import { findGuardianByPhone, findStaffByPhone, verifyWhatsAppSignature } from "@/lib/whatsapp";
import { ehPedidoDeAcesso } from "@/lib/acesso";
import { responderNumeroNaoCadastrado, responderPedidoDeAcesso } from "@/lib/pedido-acesso";

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

interface WhatsAppStatus {
  id: string;
  status: string;
  recipient_id?: string;
  errors?: { code: number; title?: string; message?: string; error_data?: { details?: string } }[];
}

interface WhatsAppWebhookPayload {
  entry?: {
    changes?: {
      field: string;
      value?: { messages?: WhatsAppMessage[]; statuses?: WhatsAppStatus[] };
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

    // A Meta aceita o envio (200 + id) e só depois avisa, por aqui, se a entrega falhou —
    // ex.: 131047, texto livre fora da janela de 24h. Registra para aparecer nos logs.
    const falhas = (payload.entry ?? [])
      .flatMap((entry) => entry.changes ?? [])
      .flatMap((change) => change.value?.statuses ?? [])
      .filter((st) => st.status === "failed");
    for (const falha of falhas) {
      const erro = falha.errors?.[0];
      console.error(
        `WhatsApp: entrega falhou para ${falha.recipient_id ?? "?"} (mensagem ${falha.id}): ` +
          `${erro?.code ?? "?"} ${erro?.title ?? ""} ${erro?.error_data?.details ?? ""}`.trim(),
      );
    }

    for (const msg of mensagens) {
      const jaProcessada = await prisma.message.findUnique({ where: { externalId: msg.id } });
      if (jaProcessada) continue;

      const textoRecebido = msg.type === "text" ? (msg.text?.body ?? "") : "";
      const pediuAcesso = ehPedidoDeAcesso(textoRecebido);

      const guardian = await findGuardianByPhone(msg.from);
      if (!guardian) {
        // Equipe (coordenação, professores, auxiliares) também pode pedir o acesso por "ACESSO".
        const equipe = pediuAcesso ? await findStaffByPhone(msg.from) : null;
        if (equipe) {
          await responderPedidoDeAcesso(equipe, msg.from, `${request.nextUrl.origin}/login`).catch((err) =>
            console.error("Falha ao responder pedido de acesso da equipe pelo WhatsApp", err),
          );
          continue;
        }
        console.warn(`Mensagem WhatsApp recebida de número não cadastrado: ${msg.from}`);
        if (pediuAcesso) {
          await responderNumeroNaoCadastrado(msg.from).catch((err) =>
            console.error("Falha ao responder pedido de acesso de número não cadastrado", err),
          );
        }
        continue;
      }

      const conversationId = await resolveConversationId(guardian.id, guardian.schoolId, msg.context);
      if (!conversationId) {
        if (pediuAcesso) {
          await responderPedidoDeAcesso(guardian, msg.from, `${request.nextUrl.origin}/guia`).catch((err) =>
            console.error("Falha ao responder pedido de acesso pelo WhatsApp", err),
          );
        }
        continue;
      }

      const corpo = msg.type === "text" ? (msg.text?.body ?? "") : `[Mensagem do tipo "${msg.type}" recebida no WhatsApp — abra o WhatsApp da escola para ver o conteúdo]`;
      if (!corpo) continue;

      const recebida = await prisma.message.create({
        data: { conversationId, senderId: guardian.id, body: corpo, channel: "WHATSAPP", externalId: msg.id },
      });

      // "ACESSO"/"SENHA": responde na hora com link e senha provisória (janela de 24h aberta).
      if (pediuAcesso) {
        await responderPedidoDeAcesso(guardian, msg.from, `${request.nextUrl.origin}/guia`).catch((err) =>
          console.error("Falha ao responder pedido de acesso pelo WhatsApp", err),
        );
        continue;
      }

      const conversation = await prisma.conversation.findUniqueOrThrow({ where: { id: conversationId } });
      const origem = request.nextUrl.origin;
      after(async () => {
        await notifyUsers([conversation.staffId], {
          title: `WhatsApp de ${guardian.name}`,
          body: corpo.slice(0, 120),
          url: `/dashboard/mensagens/${conversationId}`,
        }).catch((err) => console.error("push notify failed", err));
        await avisarEquipePorWhatsApp({
          destinatarioId: conversation.staffId,
          remetente: `${guardian.name} (WhatsApp)`,
          texto: corpo,
          link: `${origem}/dashboard/mensagens/${conversationId}`,
          tipo: "familia",
          conversationId,
          mensagemId: recebida.id,
        });
      });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
}
