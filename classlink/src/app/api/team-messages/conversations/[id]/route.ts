import { NextRequest, NextResponse, after } from "next/server";
import { avisarEquipePorWhatsApp } from "@/lib/avisos-equipe";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { handleApiError } from "@/lib/http";
import { assertTeamConversationParticipant } from "@/lib/messaging";
import { notifyUsers } from "@/lib/push";

export async function GET(_request: NextRequest, ctx: RouteContext<"/api/team-messages/conversations/[id]">) {
  try {
    const session = await requireRole("ADMIN", "STAFF");
    const { id } = await ctx.params;
    await assertTeamConversationParticipant(id, session.sub);

    const [conversation, messages] = await Promise.all([
      prisma.teamConversation.findUniqueOrThrow({
        where: { id },
        include: {
          userA: { select: { id: true, name: true, role: true } },
          userB: { select: { id: true, name: true, role: true } },
        },
      }),
      prisma.teamMessage.findMany({
        where: { conversationId: id },
        orderBy: { createdAt: "asc" },
        include: { sender: { select: { id: true, name: true, role: true } } },
      }),
    ]);

    await prisma.teamMessage.updateMany({
      where: { conversationId: id, senderId: { not: session.sub }, readAt: null },
      data: { readAt: new Date() },
    });

    return NextResponse.json({ conversation, messages });
  } catch (error) {
    return handleApiError(error);
  }
}

const sendSchema = z.object({ body: z.string().min(1).max(4000) });

export async function POST(request: NextRequest, ctx: RouteContext<"/api/team-messages/conversations/[id]">) {
  try {
    const session = await requireRole("ADMIN", "STAFF");
    const { id } = await ctx.params;
    const conversation = await assertTeamConversationParticipant(id, session.sub);
    const { body } = sendSchema.parse(await request.json());

    const message = await prisma.teamMessage.create({
      data: { conversationId: id, senderId: session.sub, body },
      include: { sender: { select: { id: true, name: true, role: true } } },
    });

    const recipientId = conversation.userAId === session.sub ? conversation.userBId : conversation.userAId;
    const origem = request.nextUrl.origin;
    after(async () => {
      await notifyUsers([recipientId], {
        title: `Nova mensagem de ${message.sender.name}`,
        body: body.slice(0, 120),
        url: `/dashboard/mensagens/${id}?tipo=equipe`,
      }).catch((err) => console.error("push notify failed", err));
      await avisarEquipePorWhatsApp({
        destinatarioId: recipientId,
        remetente: message.sender.name,
        texto: body,
        link: `${origem}/dashboard/mensagens/${id}?tipo=equipe`,
        tipo: "equipe",
        conversationId: id,
        mensagemId: message.id,
      });
    });

    return NextResponse.json({ message }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
