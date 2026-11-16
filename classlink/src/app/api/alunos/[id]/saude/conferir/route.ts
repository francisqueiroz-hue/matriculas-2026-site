import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { handleApiError } from "@/lib/http";
import { AuthError } from "@/lib/session";
import { acessoFichaSaude, linhasHistorico } from "@/lib/ficha-saude-acesso";

/**
 * A escola confirma que viu a alteração feita pela família e atualizou os protocolos
 * (cozinha, sala, saída). Tira o aviso "a conferir" e registra quem conferiu e quando.
 */
export async function POST(_request: NextRequest, ctx: RouteContext<"/api/alunos/[id]/saude/conferir">) {
  try {
    const { id } = await ctx.params;
    const { session, papel } = await acessoFichaSaude(id);
    if (papel !== "ESCOLA") throw new AuthError("Só a escola confere as alterações", 403);

    const agora = new Date();
    const r = await prisma.$transaction(async (tx) => {
      const atual = await tx.fichaSaude.findUnique({
        where: { studentId: id },
        select: { pendenteConferenciaDesde: true, alteradoPelaFamiliaPor: true },
      });
      if (!atual?.pendenteConferenciaDesde) return null;
      await tx.fichaSaude.update({
        where: { studentId: id },
        data: { pendenteConferenciaDesde: null, conferidoEm: agora, conferidoPorNome: session.name },
      });
      await tx.alteracaoCadastro.createMany({
        data: linhasHistorico(session.schoolId, id, session.sub, `${session.name} (escola)`, [
          { campo: "conferencia", valorAnterior: `Alterado por ${atual.alteradoPelaFamiliaPor ?? "família"}`, valorNovo: "Conferido e protocolos atualizados" },
        ]),
      });
      return true;
    });
    if (!r) return NextResponse.json({ error: "Nada a conferir neste aluno" }, { status: 409 });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
}
