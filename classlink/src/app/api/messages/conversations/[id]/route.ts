import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/session";
import { handleApiError } from "@/lib/http";
import { assertConversationParticipant } from "@/lib/messaging";
import { sendMessageSchema } from "@/lib/validators";
import { notifyUsers } from "@/lib/push";

export async function GET(_request: NextRequest, ctx: RouteContext<"/api/messages/conversations/[id]">) {
  try {
    const session = await requireSession();
    const { id } = await ctx.params;
    await assertConversationParticipant(id, session.sub);

    const [conversation, messages] = await Promise.all([
      prisma.conversation.findUniqueOrThrow({
        where: { id },
        include: {
          staff: { select: { id: true, name: true, role: true } },
          guardian: { select: { id: true, name: true } },
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
    const { body } = sendMessageSchema.parse(await request.json());

    const message = await prisma.message.create({
      data: { conversationId: id, senderId: session.sub, body },
      include: { sender: { select: { id: true, name: true, role: true } } },
    });

    const recipientId = conversation.staffId === session.sub ? conversation.guardianId : conversation.staffId;
    void notifyUsers([recipientId], {
      title: `Nova mensagem de ${message.sender.name}`,
      body: body.slice(0, 120),
      url: `/dashboard/mensagens/${id}`,
    }).catch((err) => console.error("push notify failed", err));

    return NextResponse.json({ message }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
