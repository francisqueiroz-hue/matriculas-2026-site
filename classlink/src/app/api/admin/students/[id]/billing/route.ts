import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { handleApiError } from "@/lib/http";
import { setMensalidadeSchema } from "@/lib/validators";
import { alteracoesFinanceiro } from "@/lib/historico-cadastro";
import { DIA_VENCIMENTO_PADRAO } from "@/lib/billing";

/**
 * Configura o valor de mensalidade de um aluno específico (o vencimento é sempre dia 05),
 * ou marca o aluno como isento (bolsista), o que apaga a mensalidade. Mudanças de mensalidade e
 * de isenção ficam no histórico de cadastro.
 */
export async function PUT(request: NextRequest, ctx: RouteContext<"/api/admin/students/[id]/billing">) {
  try {
    const session = await requireRole("ADMIN");
    const { id } = await ctx.params;
    const body = setMensalidadeSchema.parse(await request.json());

    const updated = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "Student" WHERE "id" = ${id} FOR UPDATE`;
      const student = await tx.student.findFirst({
        where: { id, schoolId: session.schoolId },
        select: { mensalidadeValor: true, bolsista: true },
      });
      if (!student) return null;

      const bolsista = body.bolsista ?? student.bolsista;
      const mensalidadeValor = bolsista ? null : body.mensalidadeValor;
      const alteracoes = alteracoesFinanceiro(
        { mensalidade: student.mensalidadeValor === null ? null : Number(student.mensalidadeValor), bolsista: student.bolsista },
        { mensalidade: mensalidadeValor, bolsista },
      );

      const atualizado = await tx.student.update({
        where: { id },
        data: {
          mensalidadeValor,
          bolsista,
          diaVencimento: DIA_VENCIMENTO_PADRAO,
        },
        select: { id: true, mensalidadeValor: true, diaVencimento: true, bolsista: true },
      });
      if (alteracoes.length > 0) {
        await tx.alteracaoCadastro.createMany({
          data: alteracoes.map((a) => ({
            ...a,
            schoolId: session.schoolId,
            entidade: "ALUNO",
            entidadeId: id,
            porUserId: session.sub,
            porNome: session.name,
          })),
        });
      }
      return atualizado;
    });
    if (!updated) return NextResponse.json({ error: "Aluno não encontrado" }, { status: 404 });

    return NextResponse.json({ student: updated });
  } catch (error) {
    return handleApiError(error);
  }
}
