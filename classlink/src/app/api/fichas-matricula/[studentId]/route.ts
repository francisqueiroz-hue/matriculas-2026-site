import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { handleApiError } from "@/lib/http";
import { alunoDaEscola, exigirEquipe } from "@/lib/ficha-matricula-acesso";
import { anoLetivoPadrao, anoLetivoSchema, montarChecklist, tiposVisiveis } from "@/lib/ficha-matricula";

/** Ficha de um aluno: checklist de documentos do ano letivo e histórico de consentimentos. */
export async function GET(request: NextRequest, ctx: RouteContext<"/api/fichas-matricula/[studentId]">) {
  try {
    const session = await exigirEquipe();
    const { studentId } = await ctx.params;
    const aluno = await alunoDaEscola(studentId, session.schoolId);
    if (!aluno) return NextResponse.json({ error: "Aluno não encontrado" }, { status: 404 });

    const anoParam = request.nextUrl.searchParams.get("ano");
    const anoLetivo = anoParam ? anoLetivoSchema.parse(anoParam) : anoLetivoPadrao(aluno.class?.year);

    const [registros, consentimentos] = await Promise.all([
      prisma.matriculaDocumento.findMany({
        // O laudo nem sai do banco para quem não é da direção.
        where: { studentId, anoLetivo, tipo: { in: tiposVisiveis(session.papel) } },
        select: { id: true, tipo: true, recebido: true, recebidoEm: true, prazo: true, observacao: true },
      }),
      prisma.consentimentoLgpd.findMany({
        where: { studentId },
        orderBy: { consentidoEm: "desc" },
        select: {
          id: true,
          finalidade: true,
          versaoTexto: true,
          consentidoPorId: true,
          consentidoPorNome: true,
          consentidoEm: true,
          revogadoEm: true,
        },
      }),
    ]);

    return NextResponse.json({
      aluno: { id: aluno.id, name: aluno.name, turma: aluno.class?.name ?? null },
      responsaveis: aluno.guardians.map((g) => ({ id: g.guardian.id, name: g.guardian.name, relation: g.relation })),
      anoLetivo,
      papel: session.papel,
      documentos: montarChecklist(registros, session.papel),
      consentimentos,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
