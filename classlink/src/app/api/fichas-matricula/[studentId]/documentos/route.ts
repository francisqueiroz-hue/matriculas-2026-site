import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { handleApiError } from "@/lib/http";
import { alunoDaEscola, exigirEquipe } from "@/lib/ficha-matricula-acesso";
import { atualizarDocumentoSchema, dadosDaAtualizacao, montarChecklist, podeVerTipo } from "@/lib/ficha-matricula";

/** Marca/desmarca a entrega de um documento, ajusta prazo e observação (cria o item se não existir). */
export async function PUT(request: NextRequest, ctx: RouteContext<"/api/fichas-matricula/[studentId]/documentos">) {
  try {
    const session = await exigirEquipe();
    const { studentId } = await ctx.params;
    const entrada = atualizarDocumentoSchema.parse(await request.json());

    // Laudo: dado sensível e voluntário — só a direção.
    if (!podeVerTipo(session.papel, entrada.tipo)) {
      return NextResponse.json({ error: "Somente a direção pode registrar o laudo." }, { status: 403 });
    }
    const aluno = await alunoDaEscola(studentId, session.schoolId);
    if (!aluno) return NextResponse.json({ error: "Aluno não encontrado" }, { status: 404 });

    const chave = { studentId_anoLetivo_tipo: { studentId, anoLetivo: entrada.anoLetivo, tipo: entrada.tipo } };
    const atual = await prisma.matriculaDocumento.findUnique({ where: chave, select: { recebido: true, recebidoEm: true } });
    const dados = dadosDaAtualizacao(entrada, atual);

    const salvo = await prisma.matriculaDocumento.upsert({
      where: chave,
      update: dados,
      create: { schoolId: session.schoolId, studentId, anoLetivo: entrada.anoLetivo, tipo: entrada.tipo, ...dados },
      select: { id: true, tipo: true, recebido: true, recebidoEm: true, prazo: true, observacao: true },
    });
    const [item] = montarChecklist([salvo], session.papel).filter((i) => i.tipo === salvo.tipo);
    return NextResponse.json({ documento: item });
  } catch (error) {
    return handleApiError(error);
  }
}
