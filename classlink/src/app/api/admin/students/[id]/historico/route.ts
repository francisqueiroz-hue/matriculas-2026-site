import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { handleApiError } from "@/lib/http";
import { ehDirecao } from "@/lib/equipe";

/** Campos do histórico que são dados financeiros: só a direção vê. */
const CAMPOS_FINANCEIROS = ["mensalidade", "vencimento", "bolsista"];

/** Histórico de alterações do cadastro do aluno — só a Administração (ADMIN) vê. */
export async function GET(_request: NextRequest, ctx: RouteContext<"/api/admin/students/[id]/historico">) {
  try {
    const session = await requireRole("ADMIN");
    const { id } = await ctx.params;

    const aluno = await prisma.student.findFirst({ where: { id, schoolId: session.schoolId }, select: { id: true } });
    if (!aluno) return NextResponse.json({ error: "Aluno não encontrado" }, { status: 404 });

    const quem = await prisma.user.findUnique({ where: { id: session.sub }, select: { role: true, funcao: true } });
    const direcao = !!quem && ehDirecao(quem);

    const registros = await prisma.alteracaoCadastro.findMany({
      where: {
        schoolId: session.schoolId,
        entidade: "ALUNO",
        entidadeId: id,
        ...(direcao ? {} : { campo: { notIn: CAMPOS_FINANCEIROS } }),
      },
      orderBy: { criadoEm: "desc" },
      take: 100,
      select: { id: true, campo: true, valorAnterior: true, valorNovo: true, porNome: true, criadoEm: true },
    });
    return NextResponse.json({ historico: registros.map((r) => ({ ...r, criadoEm: r.criadoEm.toISOString() })) });
  } catch (error) {
    return handleApiError(error);
  }
}
