import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { handleApiError } from "@/lib/http";
import { desvincularResponsavel } from "@/lib/exclusao";

/**
 * Revoga o vínculo entre responsável e aluno (LGPD: direito de desvinculação). Com
 * ?excluir=1, exclui também o acesso do responsável se ele não tiver outro aluno.
 */
export async function DELETE(
  request: NextRequest,
  ctx: RouteContext<"/api/admin/students/[id]/guardians/[guardianId]">,
) {
  try {
    const session = await requireRole("ADMIN");
    const { id: studentId, guardianId } = await ctx.params;

    const student = await prisma.student.findFirst({ where: { id: studentId, schoolId: session.schoolId } });
    if (!student) return NextResponse.json({ error: "Aluno não encontrado" }, { status: 404 });

    const vinculo = await prisma.guardianStudent.findUnique({ where: { guardianId_studentId: { guardianId, studentId } } });
    if (!vinculo) return NextResponse.json({ error: "Vínculo não encontrado" }, { status: 404 });

    const excluido = await desvincularResponsavel(
      studentId,
      guardianId,
      session.schoolId,
      request.nextUrl.searchParams.get("excluir") === "1",
    );
    return NextResponse.json({ ok: true, responsavelExcluido: excluido });
  } catch (error) {
    return handleApiError(error);
  }
}
