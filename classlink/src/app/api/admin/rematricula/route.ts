import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { handleApiError } from "@/lib/http";
import { ANO_LETIVO_MATRICULAS } from "@/lib/solicitacoes-matricula";
import { etapaDoAluno, resumirFunil, type StatusContrato } from "@/lib/rematricula-funil";

/** Situação da rematrícula de cada aluno ativo (confirmação da família + contrato do ano). */
export async function GET(request: NextRequest) {
  try {
    const session = await requireRole("ADMIN");
    const ano = Number(request.nextUrl.searchParams.get("ano")) || ANO_LETIVO_MATRICULAS;

    const [alunos, confirmacoes, contratos] = await Promise.all([
      prisma.student.findMany({
        where: { schoolId: session.schoolId, deletedAt: null },
        orderBy: [{ class: { name: "asc" } }, { name: "asc" }],
        select: {
          id: true,
          name: true,
          class: { select: { id: true, name: true } },
          guardians: { select: { guardian: { select: { id: true, name: true, phone: true } } } },
        },
      }),
      prisma.solicitacaoMatricula.findMany({
        where: { schoolId: session.schoolId, tipo: "REMATRICULA", anoLetivo: ano, responsavelId: { not: null }, status: { not: "DESISTIU" } },
        select: { responsavelId: true },
      }),
      prisma.contrato.findMany({
        where: { schoolId: session.schoolId, anoLetivo: ano },
        orderBy: { createdAt: "asc" },
        select: { studentId: true, status: true },
      }),
    ]);

    const responsaveisQueConfirmaram = new Set(confirmacoes.map((c) => c.responsavelId));
    // Mais de um contrato no ano para o mesmo aluno: vale o mais recente.
    const contratoPorAluno = new Map<string, StatusContrato>();
    for (const c of contratos) contratoPorAluno.set(c.studentId, c.status as StatusContrato);

    const linhas = alunos.map((a) => {
      const confirmou = a.guardians.some((g) => responsaveisQueConfirmaram.has(g.guardian.id));
      const etapa = etapaDoAluno({ confirmou, contratoStatus: contratoPorAluno.get(a.id) ?? null });
      return {
        id: a.id,
        nome: a.name,
        turma: a.class ? { id: a.class.id, nome: a.class.name } : null,
        etapa,
        responsaveis: a.guardians.map((g) => ({ id: g.guardian.id, nome: g.guardian.name, telefone: g.guardian.phone })),
      };
    });

    return NextResponse.json({ ano, resumo: resumirFunil(linhas.map((l) => l.etapa)), alunos: linhas });
  } catch (error) {
    return handleApiError(error);
  }
}
