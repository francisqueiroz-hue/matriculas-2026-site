import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/session";
import { handleApiError } from "@/lib/http";

/** Lista de pessoas com quem o usuário atual pode iniciar uma conversa. */
export async function GET() {
  try {
    const session = await requireSession();

    if (session.role === "GUARDIAN") {
      const links = await prisma.guardianStudent.findMany({
        where: { guardianId: session.sub, student: { deletedAt: null } },
        select: { student: { select: { classId: true } } },
      });
      const classIds = [...new Set(links.map((l) => l.student.classId))];

      const contacts = await prisma.user.findMany({
        where: {
          schoolId: session.schoolId,
          active: true,
          OR: [{ role: "ADMIN" }, { role: "STAFF", classesTeaching: { some: { classId: { in: classIds } } } }],
        },
        select: { id: true, name: true, role: true },
        orderBy: { name: "asc" },
      });
      return NextResponse.json({ contacts });
    }

    // STAFF/ADMIN: responsáveis dos alunos das turmas atendidas (admin vê todos)
    const classFilter =
      session.role === "ADMIN"
        ? {}
        : { student: { classId: { in: (await prisma.classTeacher.findMany({ where: { teacherId: session.sub }, select: { classId: true } })).map((c) => c.classId) }, deletedAt: null } };

    const guardianLinks = await prisma.guardianStudent.findMany({
      where: { guardian: { schoolId: session.schoolId, active: true }, ...classFilter },
      select: { guardian: { select: { id: true, name: true, role: true } } },
      distinct: ["guardianId"],
    });

    return NextResponse.json({
      contacts: guardianLinks.map((l) => l.guardian).sort((a, b) => a.name.localeCompare(b.name)),
    });
  } catch (error) {
    return handleApiError(error);
  }
}
