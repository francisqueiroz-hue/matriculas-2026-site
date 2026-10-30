import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { handleApiError } from "@/lib/http";
import { marcarBolsistasSchema } from "@/lib/validators";
import { alteracoesFinanceiro } from "@/lib/historico-cadastro";

/**
 * Marca de uma vez como isentos (bolsistas) os alunos escolhidos pela Administração. Só vale
 * para quem ainda não tem mensalidade lançada: aluno com valor fica como está (a escola tira o
 * valor no cadastro, se for o caso). Cada marcação vai para o histórico de cadastro.
 */
export async function POST(request: NextRequest) {
  try {
    const session = await requireRole("ADMIN");
    const { studentIds } = marcarBolsistasSchema.parse(await request.json());

    const marcados = await prisma.$transaction(async (tx) => {
      const alvos = await tx.student.findMany({
        where: { id: { in: studentIds }, schoolId: session.schoolId, deletedAt: null, mensalidadeValor: null, bolsista: false },
        select: { id: true },
      });
      if (alvos.length === 0) return [];
      const ids = alvos.map((a) => a.id);
      // Repete o filtro: quem recebeu mensalidade entre a leitura e a escrita não é marcado.
      await tx.student.updateMany({ where: { id: { in: ids }, mensalidadeValor: null, bolsista: false }, data: { bolsista: true } });
      const [alteracao] = alteracoesFinanceiro({ mensalidade: null, bolsista: false }, { mensalidade: null, bolsista: true });
      await tx.alteracaoCadastro.createMany({
        data: ids.map((entidadeId) => ({
          ...alteracao,
          schoolId: session.schoolId,
          entidade: "ALUNO",
          entidadeId,
          porUserId: session.sub,
          porNome: session.name,
        })),
      });
      return ids;
    });

    return NextResponse.json({ marcados: marcados.length, ignorados: studentIds.length - marcados.length });
  } catch (error) {
    return handleApiError(error);
  }
}
