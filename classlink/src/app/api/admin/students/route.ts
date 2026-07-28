import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { handleApiError } from "@/lib/http";
import { createStudentSchema } from "@/lib/validators";

export async function GET(request: NextRequest) {
  try {
    const session = await requireRole("ADMIN", "STAFF");
    const classId = request.nextUrl.searchParams.get("classId") ?? undefined;

    const students = await prisma.student.findMany({
      where: { schoolId: session.schoolId, deletedAt: null, ...(classId ? { classId } : {}) },
      include: {
        class: { select: { id: true, name: true, year: true } },
        guardians: { include: { guardian: { select: { id: true, name: true, email: true, phone: true } } } },
      },
      orderBy: { name: "asc" },
    });
    return NextResponse.json({ students });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await requireRole("ADMIN");
    const body = createStudentSchema.parse(await request.json());

    const cls = await prisma.class.findFirst({ where: { id: body.classId, schoolId: session.schoolId } });
    if (!cls) return NextResponse.json({ error: "Turma não encontrada" }, { status: 404 });

    const student = await prisma.student.create({
      data: {
        name: body.name,
        classId: body.classId,
        schoolId: session.schoolId,
        birthDate: body.birthDate ? new Date(body.birthDate) : undefined,
      },
    });
    return NextResponse.json({ student }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
