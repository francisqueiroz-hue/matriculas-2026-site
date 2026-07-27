import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/session";
import { handleApiError } from "@/lib/http";
import { shareClass } from "@/lib/messaging";

export async function GET() {
  try {
    const session = await requireSession();

    const conversations = await prisma.conversation.findMany({
      where:
        session.role === "GUARDIAN"
          ? { guardianId: session.sub }
          : session.role === "ADMIN"
            ? { OR: [{ staffId: session.sub }] }
            : { staffId: session.sub },
      include: {
        staff: { select: { id: true, name: true, role: true } },
        guardian: { select: { id: true, name: true } },
        messages: { orderBy: { createdAt: "desc" }, take: 1 },
        _count: {
          select: {
            messages: session.role === "GUARDIAN" ? { where: { senderId: { not: session.sub }, readAt: null } } : true,
          },
        },
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
    const session = await requireSession();
    const { counterpartUserId } = startSchema.parse(await request.json());

    const counterpart = await prisma.user.findFirst({
      where: { id: counterpartUserId, schoolId: session.schoolId, active: true },
    });
    if (!counterpart) return NextResponse.json({ error: "Usuário não encontrado" }, { status: 404 });

    let staffId: string;
    let guardianId: string;

    if (session.role === "GUARDIAN") {
      if (counterpart.role === "GUARDIAN") {
        return NextResponse.json({ error: "Selecione um funcionário para conversar" }, { status: 400 });
      }
      staffId = counterpart.id;
      guardianId = session.sub;
      if (!(await shareClass(staffId, guardianId, counterpart.role as "ADMIN" | "STAFF"))) {
        return NextResponse.json({ error: "Este funcionário não atende a turma do seu filho(a)" }, { status: 403 });
      }
    } else {
      if (counterpart.role !== "GUARDIAN") {
        return NextResponse.json({ error: "Selecione um responsável para conversar" }, { status: 400 });
      }
      staffId = session.sub;
      guardianId = counterpart.id;
      if (!(await shareClass(staffId, guardianId, session.role as "ADMIN" | "STAFF"))) {
        return NextResponse.json({ error: "Você não atende a turma deste responsável" }, { status: 403 });
      }
    }

    const conversation = await prisma.conversation.upsert({
      where: { staffId_guardianId: { staffId, guardianId } },
      update: {},
      create: { staffId, guardianId },
      include: {
        staff: { select: { id: true, name: true, role: true } },
        guardian: { select: { id: true, name: true } },
      },
    });

    return NextResponse.json({ conversation }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
