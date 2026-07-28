import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { handleApiError } from "@/lib/http";
import { updateStudentSchema } from "@/lib/validators";

export async function PATCH(request: NextRequest, ctx: RouteContext<"/api/admin/students/[id]">) {
  try {
    const session = await requireRole("ADMIN");
    const { id } = await ctx.params;
    const body = updateStudentSchema.parse(await request.json());

    const existing = await prisma.student.findFirst({ where: { id, schoolId: session.schoolId } });
    if (!existing) return NextResponse.json({ error: "Aluno não encontrado" }, { status: 404 });

    const student = await prisma.student.update({
      where: { id },
      data: {
        ...(body.name ? { name: body.name } : {}),
        ...(body.classId ? { classId: body.classId } : {}),
        ...(body.birthDate ? { birthDate: new Date(body.birthDate) } : {}),
      },
    });
    return NextResponse.json({ student });
  } catch (error) {
    return handleApiError(error);
  }
}

/** Exclusão lógica — mantém histórico de frequência/posts já vinculados. */
export async function DELETE(_request: NextRequest, ctx: RouteContext<"/api/admin/students/[id]">) {
  try {
    const session = await requireRole("ADMIN");
    const { id } = await ctx.params;

    const existing = await prisma.student.findFirst({ where: { id, schoolId: session.schoolId } });
    if (!existing) return NextResponse.json({ error: "Aluno não encontrado" }, { status: 404 });

    await prisma.student.update({ where: { id }, data: { deletedAt: new Date() } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
}
