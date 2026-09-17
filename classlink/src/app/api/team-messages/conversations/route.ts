import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { handleApiError } from "@/lib/http";
import { ordenarDupla } from "@/lib/messaging";

export async function GET() {
  try {
    const session = await requireRole("ADMIN", "STAFF");

    const conversations = await prisma.teamConversation.findMany({
      where: { OR: [{ userAId: session.sub }, { userBId: session.sub }] },
      include: {
        userA: { select: { id: true, name: true, role: true } },
        userB: { select: { id: true, name: true, role: true } },
        messages: { orderBy: { createdAt: "desc" }, take: 1 },
        _count: { select: { messages: { where: { senderId: { not: session.sub }, readAt: null } } } },
      },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({ conversations });
  } catch (error) {
    return handleApiError(error);
  }
}

const startSchema = z.object({ counterpartUserId: z.string().min(1) });

export async function POST(request: NextRequest) {
  try {
    const session = await requireRole("ADMIN", "STAFF");
    const { counterpartUserId } = startSchema.parse(await request.json());

    if (counterpartUserId === session.sub) {
      return NextResponse.json({ error: "Você não pode iniciar uma conversa consigo mesmo" }, { status: 400 });
    }

    const counterpart = await prisma.user.findFirst({
      where: { id: counterpartUserId, schoolId: session.schoolId, active: true, role: { in: ["ADMIN", "STAFF"] } },
    });
    if (!counterpart) return NextResponse.json({ error: "Usuário não encontrado" }, { status: 404 });

    const [userAId, userBId] = ordenarDupla(session.sub, counterpartUserId);

    const conversation = await prisma.teamConversation.upsert({
      where: { userAId_userBId: { userAId, userBId } },
      update: {},
      create: { userAId, userBId, schoolId: session.schoolId },
      include: {
        userA: { select: { id: true, name: true, role: true } },
        userB: { select: { id: true, name: true, role: true } },
      },
    });

    return NextResponse.json({ conversation }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
