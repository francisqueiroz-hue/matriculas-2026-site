import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { handleApiError } from "@/lib/http";
import { alunosDaFamilia } from "@/lib/escopo-acesso";
import { exigirArea } from "@/lib/visibilidade-server";
import { responsavelVeItem, semDadosDaRegra } from "@/lib/responsavel-financeiro";

/** "Meus boletos" — todos os boletos dos alunos vinculados ao responsável logado. */
export async function GET() {
  try {
    const session = await requireRole("GUARDIAN");
    await exigirArea(session, "FINANCEIRO");

    const filhos = await alunosDaFamilia(session.sub);

    const boletos = await prisma.boleto.findMany({
      // Cancelado pela escola (ex.: lançado em duplicidade) não aparece para a família.
      where: { studentId: { in: filhos.map((f) => f.studentId) }, status: { not: "CANCELADO" } },
      include: { student: { select: { id: true, name: true } } },
      orderBy: [{ mesReferencia: "desc" }],
    });

    // Boleto da regra do responsável financeiro: só o destinatário vê. Anteriores: todos, como era.
    return NextResponse.json({
      boletos: boletos
        .filter((b) => responsavelVeItem(b, true, session.sub))
        .map(semDadosDaRegra),
    });
  } catch (error) {
    return handleApiError(error);
  }
}
