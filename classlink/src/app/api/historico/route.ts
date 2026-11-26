import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { handleApiError } from "@/lib/http";
import { historicoAlunoSchema } from "@/lib/historico-escolar";
import {
  alunoDaEscola,
  carregarModeloHistorico,
  exigirQuemEmiteHistorico,
  exigirQuemVeHistorico,
  historicoDoAluno,
  mediasDoAno,
  validar,
} from "@/lib/historico-server";

const SEM_CACHE = { "Cache-Control": "private, no-store" };

/**
 * Histórico escolar: direção, secretaria e coordenação veem; só direção e coordenação salvam.
 *  - sem parâmetros: lista os alunos ativos da escola, com a turma e se já há histórico salvo;
 *  - ?aluno=<id>: o modelo da escola e o histórico do aluno (o salvo ou um já preenchido com o
 *    que o app sabe);
 *  - ?aluno=<id>&medias=1: só as médias finais do ano em curso, para trazer de novo à coluna do ano.
 */
export async function GET(request: NextRequest) {
  try {
    const session = await exigirQuemVeHistorico();
    const id = request.nextUrl.searchParams.get("aluno");
    if (!id) {
      const alunos = await prisma.student.findMany({
        where: { schoolId: session.schoolId, deletedAt: null },
        select: { id: true, name: true, class: { select: { name: true } }, historicoEscolar: { select: { updatedAt: true } } },
        orderBy: { name: "asc" },
      });
      return NextResponse.json(
        { alunos: alunos.map((a) => ({ id: a.id, nome: a.name, turma: a.class.name, salvoEm: a.historicoEscolar?.updatedAt ?? null })) },
        { headers: SEM_CACHE },
      );
    }
    const aluno = await alunoDaEscola(session.schoolId, id);
    const modelo = await carregarModeloHistorico(session.schoolId);
    if (request.nextUrl.searchParams.get("medias") === "1") {
      const medias = await mediasDoAno(session.schoolId, aluno.id);
      return NextResponse.json({ ano: aluno.class.year, turma: aluno.class.name, medias: [...medias.values()] }, { headers: SEM_CACHE });
    }
    const { historico, salvoEm } = await historicoDoAluno(session.schoolId, aluno, modelo);
    return NextResponse.json({ modelo, historico, salvoEm, turma: aluno.class.name, ano: aluno.class.year }, { headers: SEM_CACHE });
  } catch (error) {
    return handleApiError(error);
  }
}

/** Salva o histórico do aluno (para não digitar de novo). Não mexe nas notas lançadas no app. */
export async function PUT(request: NextRequest) {
  try {
    const session = await exigirQuemEmiteHistorico();
    const historico = validar(historicoAlunoSchema, await request.json());
    await alunoDaEscola(session.schoolId, historico.studentId);
    // O código INEP mora no cadastro do aluno: não é gravado no histórico.
    const { studentId, ...resto } = historico;
    const dados = { ...resto, aluno: { ...resto.aluno, codigoInep: "" } };
    const salvo = await prisma.historicoEscolar.upsert({
      where: { studentId },
      create: { schoolId: session.schoolId, studentId, dados, editadoPorId: session.sub },
      update: { dados, editadoPorId: session.sub },
      select: { updatedAt: true },
    });
    return NextResponse.json({ salvoEm: salvo.updatedAt });
  } catch (error) {
    return handleApiError(error);
  }
}
