import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { exigirDirecaoOuCoordenacao, requireRole } from "@/lib/session";
import { handleApiError } from "@/lib/http";
import { MENSAGEM_SO_DIRECAO_COORDENACAO_BOLETIM } from "@/lib/equipe";
import { respostaBoletimPdf } from "@/lib/boletim-pdf-server";
import { exigirArea } from "@/lib/visibilidade-server";

/** Boletins da turma toda em um PDF (uma página por aluno), para imprimir: só direção e coordenação. */
export async function GET(_request: NextRequest, ctx: RouteContext<"/api/notas/turma/[classId]/pdf">) {
  try {
    const session = await requireRole("ADMIN", "STAFF");
    await exigirArea(session, "NOTAS");
    await exigirDirecaoOuCoordenacao(session, MENSAGEM_SO_DIRECAO_COORDENACAO_BOLETIM);
    const { classId } = await ctx.params;

    const turma = await prisma.class.findFirst({ where: { id: classId, schoolId: session.schoolId }, select: { name: true, year: true } });
    if (!turma) return NextResponse.json({ error: "Turma não encontrada" }, { status: 404 });

    const alunos = await prisma.student.findMany({
      where: { classId, schoolId: session.schoolId, deletedAt: null },
      select: { id: true, name: true, class: { select: { name: true, year: true } } },
      orderBy: { name: "asc" },
    });
    if (alunos.length === 0) return NextResponse.json({ error: "Esta turma não tem alunos." }, { status: 400 });

    return await respostaBoletimPdf(session.schoolId, alunos, `turma-${turma.name}`, turma.year);
  } catch (error) {
    return handleApiError(error);
  }
}
