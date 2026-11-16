import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { handleApiError } from "@/lib/http";
import { acessoFichaSaude, avisarEscola, linhasHistorico } from "@/lib/ficha-saude-acesso";
import { CAMPOS_SAUDE, FICHA_VAZIA, alteracoesSaude, dadosDaFicha, type FichaSaudeDados } from "@/lib/ficha-saude";

/**
 * Retira o consentimento de dados de saúde (LGPD, art. 8º, § 5º). O registro do aceite não é
 * apagado (fica a prova de quando foi dado e retirado); as informações de saúde são apagadas da
 * ficha e a mudança vai para o histórico. Pessoas autorizadas continuam (não são dado de saúde).
 * Feito pela família, avisa a escola para atualizar os protocolos.
 */
export async function DELETE(_request: NextRequest, ctx: RouteContext<"/api/alunos/[id]/saude/consentimento">) {
  try {
    const { id } = await ctx.params;
    const { session, papel, aluno } = await acessoFichaSaude(id);
    const agora = new Date();
    const porNome = `${session.name} (${papel === "FAMILIA" ? "família" : "escola"})`;

    const revogou = await prisma.$transaction(async (tx) => {
      const r = await tx.consentimentoLgpd.updateMany({
        where: { studentId: id, finalidade: "DADO_DE_SAUDE", revogadoEm: null },
        data: { revogadoEm: agora },
      });
      if (r.count === 0) return false;
      const ficha = await tx.fichaSaude.findUnique({ where: { studentId: id }, select: Object.fromEntries(CAMPOS_SAUDE.map((c) => [c, true])) });
      const alteracoes = [
        { campo: "consentimento", valorAnterior: "Aceito", valorNovo: "Retirado; informações de saúde apagadas" },
        ...alteracoesSaude(dadosDaFicha(ficha as Partial<FichaSaudeDados> | null), FICHA_VAZIA),
      ];
      if (ficha) {
        await tx.fichaSaude.update({
          where: { studentId: id },
          data: {
            ...FICHA_VAZIA,
            atualizadoPorNome: porNome,
            ...(papel === "FAMILIA" && { pendenteConferenciaDesde: agora, alteradoPelaFamiliaPor: session.name, conferidoEm: null, conferidoPorNome: null }),
          },
        });
      }
      await tx.alteracaoCadastro.createMany({ data: linhasHistorico(session.schoolId, id, session.sub, porNome, alteracoes) });
      return true;
    });
    if (!revogou) return NextResponse.json({ error: "Não há consentimento ativo para retirar" }, { status: 404 });

    if (papel === "FAMILIA") {
      const primeiro = aluno.name.trim().split(/\s+/)[0];
      await avisarEscola(session.schoolId, id, {
        title: `Família de ${primeiro} retirou o consentimento de saúde`,
        body: `${session.name} retirou a autorização. As informações de saúde foram apagadas do app. Atualize os protocolos da escola.`,
      });
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
}
