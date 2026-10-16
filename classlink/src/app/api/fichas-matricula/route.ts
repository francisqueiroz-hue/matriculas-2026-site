import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { handleApiError } from "@/lib/http";
import { exigirEquipe } from "@/lib/ficha-matricula-acesso";
import { anoLetivoPadrao, anoLetivoSchema, resumoDocumentos, type TipoDocumento } from "@/lib/ficha-matricula";

/** Lista de alunos com o resumo de documentos entregues no ano letivo (padrão: ano corrente). */
export async function GET(request: NextRequest) {
  try {
    const session = await exigirEquipe();
    const anoParam = request.nextUrl.searchParams.get("ano");
    const anoLetivo = anoParam ? anoLetivoSchema.parse(anoParam) : anoLetivoPadrao(null);

    const [alunos, documentos] = await Promise.all([
      prisma.student.findMany({
        where: { schoolId: session.schoolId, deletedAt: null },
        select: { id: true, name: true, class: { select: { id: true, name: true } } },
        orderBy: { name: "asc" },
      }),
      prisma.matriculaDocumento.findMany({
        where: { schoolId: session.schoolId, anoLetivo },
        select: { studentId: true, tipo: true, recebido: true },
      }),
    ]);

    const porAluno = new Map<string, { tipo: TipoDocumento; recebido: boolean }[]>();
    for (const d of documentos) porAluno.set(d.studentId, [...(porAluno.get(d.studentId) ?? []), d]);

    return NextResponse.json({
      anoLetivo,
      alunos: alunos.map((a) => ({ ...a, documentos: resumoDocumentos(porAluno.get(a.id) ?? []) })),
    });
  } catch (error) {
    return handleApiError(error);
  }
}
