import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { exigirDirecaoOuCoordenacao, requireRole } from "@/lib/session";
import { handleApiError } from "@/lib/http";
import { MENSAGEM_SO_DIRECAO_COORDENACAO_BOLETIM } from "@/lib/equipe";
import { SELECT_ALUNO_BOLETIM, respostaBoletimPdf } from "@/lib/boletim-pdf-server";
import { exigirArea } from "@/lib/visibilidade-server";

/** Boletim do aluno em PDF para impressão: só direção e coordenação (famílias e professores só consultam no app). */
export async function GET(_request: NextRequest, ctx: RouteContext<"/api/notas/[studentId]/pdf">) {
  try {
    const session = await requireRole("ADMIN", "STAFF");
    await exigirArea(session, "NOTAS");
    await exigirDirecaoOuCoordenacao(session, MENSAGEM_SO_DIRECAO_COORDENACAO_BOLETIM);
    const { studentId } = await ctx.params;

    const aluno = await prisma.student.findFirst({
      where: { id: studentId, schoolId: session.schoolId, deletedAt: null },
      select: SELECT_ALUNO_BOLETIM,
    });
    if (!aluno) return NextResponse.json({ error: "Aluno não encontrado" }, { status: 404 });

    return await respostaBoletimPdf(session.schoolId, [aluno], aluno.name, aluno.class.year);
  } catch (error) {
    return handleApiError(error);
  }
}
