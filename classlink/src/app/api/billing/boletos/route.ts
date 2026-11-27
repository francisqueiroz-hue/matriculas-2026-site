import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { handleApiError } from "@/lib/http";
import { alunosDaFamilia } from "@/lib/escopo-acesso";
import { exigirArea } from "@/lib/visibilidade-server";
import { responsavelVeItem, semDadosDaRegra } from "@/lib/responsavel-financeiro";
import { completarDadosDoInter } from "@/lib/inter-completar";
import { escolaEhDemonstracao } from "@/lib/escola-demonstracao";

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
    const visiveis = boletos.filter((b) => responsavelVeItem(b, true, session.sub));

    // Emitido há pouco no Inter e ainda sem Pix/linha digitável: busca no banco agora.
    const mudancas = (await escolaEhDemonstracao(session.schoolId)) ? new Map() : await completarDadosDoInter(visiveis);

    return NextResponse.json({
      boletos: visiveis.map((b) => semDadosDaRegra({ ...b, ...(mudancas.get(b.id) ?? {}) })),
    });
  } catch (error) {
    return handleApiError(error);
  }
}
