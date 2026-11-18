import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { exigirDirecaoOuCoordenacao, requireRole } from "@/lib/session";
import { handleApiError } from "@/lib/http";
import { ErroDeUsuario } from "@/lib/erros";
import { MENSAGEM_SO_DIRECAO_COORDENACAO_BOLETIM } from "@/lib/equipe";
import { exigirArea } from "@/lib/visibilidade-server";
import { LIMITES } from "@/lib/boletim-modelo";
import { SELECT_ALUNO_BOLETIM, boletinsPreenchidos, carregarModeloBoletim } from "@/lib/boletim-pdf-server";

/**
 * Boletim(ns) preenchido(s) com as notas lançadas, para a direção ou a coordenação revisar e
 * ajustar antes de gerar o PDF. ?aluno=<id> (um aluno) ou ?turma=<id> (a turma toda).
 */
export async function GET(request: NextRequest) {
  try {
    const session = await requireRole("ADMIN", "STAFF");
    await exigirArea(session, "NOTAS");
    await exigirDirecaoOuCoordenacao(session, MENSAGEM_SO_DIRECAO_COORDENACAO_BOLETIM);
    const aluno = request.nextUrl.searchParams.get("aluno");
    const turma = request.nextUrl.searchParams.get("turma");
    if (!aluno === !turma) throw new ErroDeUsuario("Informe o aluno ou a turma.");

    const alunos = await prisma.student.findMany({
      where: { schoolId: session.schoolId, deletedAt: null, ...(aluno ? { id: aluno } : { classId: turma! }) },
      select: SELECT_ALUNO_BOLETIM,
      orderBy: { name: "asc" },
      take: LIMITES.boletinsPorPdf + 1,
    });
    if (alunos.length === 0) throw new ErroDeUsuario(aluno ? "Aluno não encontrado." : "Turma sem alunos ou não encontrada.", 404);
    if (alunos.length > LIMITES.boletinsPorPdf) throw new ErroDeUsuario(`Turma com mais de ${LIMITES.boletinsPorPdf} alunos: gere por aluno.`);

    const modelo = await carregarModeloBoletim(session.schoolId);
    return NextResponse.json({
      modelo,
      ano: alunos[0].class.year,
      boletins: await boletinsPreenchidos(session.schoolId, alunos, modelo),
    });
  } catch (error) {
    return handleApiError(error);
  }
}
