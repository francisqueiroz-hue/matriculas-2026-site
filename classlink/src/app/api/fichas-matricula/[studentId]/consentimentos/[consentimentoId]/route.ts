import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { handleApiError } from "@/lib/http";
import { exigirEquipe } from "@/lib/ficha-matricula-acesso";

/** Revoga um consentimento: preenche revogadoEm e mantém o registro (nunca apaga). */
export async function DELETE(
  _request: Request,
  ctx: RouteContext<"/api/fichas-matricula/[studentId]/consentimentos/[consentimentoId]">,
) {
  try {
    const session = await exigirEquipe();
    const { studentId, consentimentoId } = await ctx.params;
    const r = await prisma.consentimentoLgpd.updateMany({
      where: { id: consentimentoId, studentId, schoolId: session.schoolId, revogadoEm: null },
      data: { revogadoEm: new Date() },
    });
    if (r.count === 0) return NextResponse.json({ error: "Consentimento não encontrado ou já revogado" }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
}
