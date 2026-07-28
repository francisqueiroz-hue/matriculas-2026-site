import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole, requireSession } from "@/lib/session";
import { handleApiError } from "@/lib/http";
import { createEventSchema } from "@/lib/validators";
import { notifyUsers } from "@/lib/push";

export async function GET(request: NextRequest) {
  try {
    const session = await requireSession();
    const from = request.nextUrl.searchParams.get("from");
    const to = request.nextUrl.searchParams.get("to");

    let visibleClassIds: string[] | null = null;
    if (session.role === "GUARDIAN") {
      const links = await prisma.guardianStudent.findMany({
        where: { guardianId: session.sub, student: { deletedAt: null } },
        select: { student: { select: { classId: true } } },
      });
      visibleClassIds = [...new Set(links.map((l) => l.student.classId))];
    } else if (session.role === "STAFF") {
      const teaching = await prisma.classTeacher.findMany({
        where: { teacherId: session.sub },
        select: { classId: true },
      });
      visibleClassIds = [...new Set(teaching.map((t) => t.classId))];
    }

    const events = await prisma.event.findMany({
      where: {
        schoolId: session.schoolId,
        ...(from || to
          ? { startsAt: { ...(from ? { gte: new Date(from) } : {}), ...(to ? { lte: new Date(to) } : {}) } }
          : {}),
        OR: visibleClassIds === null ? undefined : [{ classId: null }, { classId: { in: visibleClassIds } }],
      },
      include: { class: { select: { id: true, name: true } }, author: { select: { id: true, name: true } } },
      orderBy: { startsAt: "asc" },
    });

    return NextResponse.json({ events });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await requireRole("ADMIN", "STAFF");
    const body = createEventSchema.parse(await request.json());

    if (body.classId) {
      const cls = await prisma.class.findFirst({ where: { id: body.classId, schoolId: session.schoolId } });
      if (!cls) return NextResponse.json({ error: "Turma não encontrada" }, { status: 404 });
      if (session.role === "STAFF") {
        const teaches = await prisma.classTeacher.findFirst({
          where: { classId: body.classId, teacherId: session.sub },
        });
        if (!teaches) return NextResponse.json({ error: "Você não leciona nesta turma" }, { status: 403 });
      }
    } else if (session.role !== "ADMIN") {
      return NextResponse.json({ error: "Apenas administradores criam eventos para toda a escola" }, { status: 403 });
    }

    const event = await prisma.event.create({
      data: {
        title: body.title,
        description: body.description,
        startsAt: new Date(body.startsAt),
        endsAt: body.endsAt ? new Date(body.endsAt) : null,
        classId: body.classId ?? null,
        schoolId: session.schoolId,
        authorId: session.sub,
      },
      include: { class: { select: { id: true, name: true } } },
    });

    const recipients = await prisma.user.findMany({
      where: {
        schoolId: session.schoolId,
        role: "GUARDIAN",
        active: true,
        ...(body.classId ? { studentLinks: { some: { student: { classId: body.classId, deletedAt: null } } } } : {}),
      },
      select: { id: true },
    });
    void notifyUsers(
      recipients.map((r) => r.id),
      { title: `Novo evento: ${event.title}`, body: event.description?.slice(0, 120) ?? "", url: "/dashboard/agenda" },
    ).catch((err) => console.error("push notify failed", err));

    return NextResponse.json({ event }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
