import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { handleApiError } from "@/lib/http";
import { alunoDaEscola, exigirEquipe } from "@/lib/ficha-matricula-acesso";
import { registrarConsentimentoSchema } from "@/lib/ficha-matricula";

/**
 * Registra um consentimento (finalidade, versão do texto e quem consentiu). Se já houver
 * um ativo da mesma finalidade, ele é encerrado (revogadoEm) — vale o mais recente, e o
 * histórico fica guardado.
 */
export async function POST(request: NextRequest, ctx: RouteContext<"/api/fichas-matricula/[studentId]/consentimentos">) {
  try {
    const session = await exigirEquipe();
    const { studentId } = await ctx.params;
    const entrada = registrarConsentimentoSchema.parse(await request.json());

    const aluno = await alunoDaEscola(studentId, session.schoolId);
    if (!aluno) return NextResponse.json({ error: "Aluno não encontrado" }, { status: 404 });

    let consentidoPorNome = entrada.consentidoPorNome ?? "";
    if (entrada.consentidoPorId) {
      // Só um responsável vinculado a este aluno pode constar como quem consentiu.
      const vinculo = aluno.guardians.find((g) => g.guardian.id === entrada.consentidoPorId);
      if (!vinculo) return NextResponse.json({ error: "Responsável não vinculado a este aluno" }, { status: 400 });
      consentidoPorNome = vinculo.guardian.name;
    }

    const agora = new Date();
    const consentimento = await prisma.$transaction(async (tx) => {
      await tx.consentimentoLgpd.updateMany({
        where: { studentId, finalidade: entrada.finalidade, revogadoEm: null },
        data: { revogadoEm: agora },
      });
      return tx.consentimentoLgpd.create({
        data: {
          schoolId: session.schoolId,
          studentId,
          finalidade: entrada.finalidade,
          versaoTexto: entrada.versaoTexto,
          consentidoPorId: entrada.consentidoPorId ?? null,
          consentidoPorNome,
          consentidoEm: agora,
        },
      });
    });
    return NextResponse.json({ consentimento }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
