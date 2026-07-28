import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireCoordenacaoOuAdmin } from "@/lib/session";
import { handleApiError } from "@/lib/http";

/** Remove a disciplina e, em cascata, todas as notas lançadas nela (confirmado na UI antes de chamar). */
export async function DELETE(_request: NextRequest, ctx: RouteContext<"/api/admin/disciplinas/[id]">) {
  try {
    const session = await requireCoordenacaoOuAdmin();
    const { id } = await ctx.params;

    const existing = await prisma.disciplina.findFirst({ where: { id, schoolId: session.schoolId } });
    if (!existing) return NextResponse.json({ error: "Disciplina não encontrada" }, { status: 404 });

    await prisma.disciplina.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
}
