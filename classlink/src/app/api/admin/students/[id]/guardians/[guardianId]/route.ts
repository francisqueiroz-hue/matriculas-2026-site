import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { handleApiError } from "@/lib/http";

/** Revoga o vínculo entre responsável e aluno (LGPD: direito de desvinculação). */
export async function DELETE(
  _request: NextRequest,
  ctx: RouteContext<"/api/admin/students/[id]/guardians/[guardianId]">,
) {
  try {
    const session = await requireRole("ADMIN");
    const { id: studentId, guardianId } = await ctx.params;

    const student = await prisma.student.findFirst({ where: { id: studentId, schoolId: session.schoolId } });
    if (!student) return NextResponse.json({ error: "Aluno não encontrado" }, { status: 404 });

    await prisma.guardianStudent.delete({
      where: { guardianId_studentId: { guardianId, studentId } },
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
}
