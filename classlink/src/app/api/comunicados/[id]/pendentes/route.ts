import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { handleApiError } from "@/lib/http";
import { getPublicoAlvo } from "@/lib/comunicados";

/** Responsáveis do público-alvo que ainda não registraram nenhuma resposta. */
export async function GET(_request: Request, ctx: RouteContext<"/api/comunicados/[id]/pendentes">) {
  try {
    const session = await requireRole("ADMIN", "STAFF");
    const { id: comunicadoId } = await ctx.params;

    const comunicado = await prisma.comunicado.findFirst({ where: { id: comunicadoId, schoolId: session.schoolId } });
    if (!comunicado) return NextResponse.json({ error: "Comunicado não encontrado" }, { status: 404 });

    const [publicoAlvo, respondidos] = await Promise.all([
      getPublicoAlvo(comunicadoId),
      prisma.respostaComunicado.findMany({
        where: { comunicadoId },
        select: { responsavelId: true, alunoId: true },
      }),
    ]);

    const respondidosSet = new Set(respondidos.map((r) => `${r.responsavelId}:${r.alunoId}`));
    const pendentes = publicoAlvo.filter((p) => !respondidosSet.has(`${p.guardianId}:${p.studentId}`));

    return NextResponse.json({
      pendentes: pendentes.map((p) => ({
        guardian: p.guardian,
        aluno: p.student,
      })),
    });
  } catch (error) {
    return handleApiError(error);
  }
}
