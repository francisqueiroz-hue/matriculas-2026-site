import { NextRequest, NextResponse, after } from "next/server";
import { avisarEquipePorWhatsApp } from "@/lib/avisos-equipe";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/session";
import { handleApiError } from "@/lib/http";
import { assertConversationParticipant } from "@/lib/messaging";
import { exigirPodeConversar, exigirPodeExcluirConversa } from "@/lib/permissoes-mensagens";
import { sendMessageSchema } from "@/lib/validators";
import { notifyUsers } from "@/lib/push";
import { isWhatsAppConfigured, normalizePhoneBR, sendWhatsAppTextMessage } from "@/lib/whatsapp";
import { isEmailConfigured, sendEmailMessage } from "@/lib/email";

export async function GET(_request: NextRequest, ctx: RouteContext<"/api/messages/conversations/[id]">) {
  try {
    const session = await requireSession();
    const { id } = await ctx.params;
    const participante = await assertConversationParticipant(id, session.sub);
    await exigirPodeConversar(participante.staffId, participante.guardianId);

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
    // Regra da escola: família ↔ direção/coordenação apenas (inclusive conversas antigas).
    await exigirPodeConversar(conversation.staffId, conversation.guardianId);
    const { body, channel } = sendMessageSchema.parse(await request.json());

    // WhatsApp/e-mail só fazem sentido enviados pela equipe ao responsável — o responsável
    // já está na conversa via app, e essas mensagens sempre partem de quem está na tela do ClassLink.
    const canalEfetivo = channel && channel !== "APP" && session.sub === conversation.staffId ? channel : "APP";

    let externalId: string | undefined;
    if (canalEfetivo === "WHATSAPP") {
      if (!isWhatsAppConfigured()) return NextResponse.json({ error: "Integração com WhatsApp não configurada" }, { status: 400 });
      const guardian = await prisma.user.findUniqueOrThrow({ where: { id: conversation.guardianId }, select: { phone: true } });
      const phone = guardian.phone ? normalizePhoneBR(guardian.phone) : null;
      if (!phone) return NextResponse.json({ error: "Responsável não tem telefone cadastrado" }, { status: 400 });
      const sent = await sendWhatsAppTextMessage(phone, body);
      externalId = sent.externalId;
    } else if (canalEfetivo === "EMAIL") {
      if (!isEmailConfigured()) return NextResponse.json({ error: "Integração de e-mail não configurada" }, { status: 400 });
      const guardian = await prisma.user.findUniqueOrThrow({ where: { id: conversation.guardianId }, select: { email: true } });
      if (!guardian.email) return NextResponse.json({ error: "Responsável não tem e-mail cadastrado" }, { status: 400 });
      const sent = await sendEmailMessage({ to: guardian.email, subject: "Nova mensagem do ClassLink", text: body, conversationId: id });
      externalId = sent.externalId;
    }

    const message = await prisma.message.create({
      data: { conversationId: id, senderId: session.sub, body, channel: canalEfetivo, externalId },
      include: { sender: { select: { id: true, name: true, role: true } } },
    });

    const recipientId = conversation.staffId === session.sub ? conversation.guardianId : conversation.staffId;
    // Depois da resposta (after): na Vercel, trabalho solto com "void" pode ser cortado.
    const origem = request.nextUrl.origin;
    after(async () => {
      if (canalEfetivo === "APP") {
        await notifyUsers([recipientId], {
          title: `Nova mensagem de ${message.sender.name}`,
          body: body.slice(0, 120),
          url: `/dashboard/mensagens/${id}`,
        }).catch((err) => console.error("push notify failed", err));
      }
      // Família escreveu pelo app: avisa a pessoa da equipe também no WhatsApp (se ela ativou).
      if (recipientId === conversation.staffId) {
        await avisarEquipePorWhatsApp({
          destinatarioId: recipientId,
          remetente: message.sender.name,
          texto: body,
          link: `${origem}/dashboard/mensagens/${id}`,
          tipo: "familia",
          conversationId: id,
          mensagemId: message.id,
        });
      }
    });

    return NextResponse.json({ message }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}

/** Exclui a conversa e todas as mensagens dela, para os dois lados (só direção/coordenação). */
export async function DELETE(_request: NextRequest, ctx: RouteContext<"/api/messages/conversations/[id]">) {
  try {
    const session = await requireSession();
    const { id } = await ctx.params;
    await assertConversationParticipant(id, session.sub);
    await exigirPodeExcluirConversa(session.sub);
    await prisma.conversation.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
}
