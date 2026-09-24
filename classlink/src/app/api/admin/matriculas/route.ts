import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { handleApiError } from "@/lib/http";
import { ANO_LETIVO_MATRICULAS, solicitacoesParaCsv } from "@/lib/solicitacoes-matricula";

const TIPOS = ["PRE_MATRICULA", "REMATRICULA"] as const;
const STATUS = ["NOVA", "EM_ATENDIMENTO", "VISITA_AGENDADA", "MATRICULADO", "DESISTIU"] as const;

/** Lista (ou exporta em CSV com ?format=csv) as pré-matrículas e rematrículas da escola. */
export async function GET(request: NextRequest) {
  try {
    const session = await requireRole("ADMIN");
    const params = request.nextUrl.searchParams;

    const ano = Number(params.get("ano")) || ANO_LETIVO_MATRICULAS;
    const tipo = TIPOS.find((t) => t === params.get("tipo"));
    const status = STATUS.find((s) => s === params.get("status"));

    const where: Prisma.SolicitacaoMatriculaWhereInput = {
      schoolId: session.schoolId,
      anoLetivo: ano,
      ...(tipo && { tipo }),
      ...(status && { status }),
    };

    const solicitacoes = await prisma.solicitacaoMatricula.findMany({
      where,
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        tipo: true,
        status: true,
        origem: true,
        anoLetivo: true,
        responsavelNome: true,
        telefone: true,
        alunoNome: true,
        serie: true,
        periodoVisita: true,
        escolaAtual: true,
        observacoes: true,
        observacoesInternas: true,
        responsavelId: true,
        createdAt: true,
      },
    });

    if (params.get("format") === "csv") {
      return new NextResponse(solicitacoesParaCsv(solicitacoes), {
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="matriculas-${ano}.csv"`,
        },
      });
    }

    // Contagem por tipo/status do ano inteiro (independente dos filtros), para os indicadores.
    const grupos = await prisma.solicitacaoMatricula.groupBy({
      by: ["tipo", "status"],
      where: { schoolId: session.schoolId, anoLetivo: ano },
      _count: { _all: true },
    });
    const resumo = grupos.map((g) => ({ tipo: g.tipo, status: g.status, total: g._count._all }));

    return NextResponse.json({ ano, solicitacoes, resumo });
  } catch (error) {
    return handleApiError(error);
  }
}
