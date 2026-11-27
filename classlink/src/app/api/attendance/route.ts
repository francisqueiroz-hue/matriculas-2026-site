import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { exigirLecionaNaTurma } from "@/lib/turmas-acesso";
import { handleApiError } from "@/lib/http";
import { markAttendanceSchema } from "@/lib/validators";
import {
  CODIGO_FREQUENCIA_JA_LANCADA,
  dataParaMeiaNoiteUtc,
  ehDuplicidadeDeFrequencia,
  mensagemFrequenciaJaLancada,
} from "@/lib/attendance";
import { exigirArea } from "@/lib/visibilidade-server";

/** Roster da turma numa data (para a tela de marcação): alunos + status já lançado, quando houver. */
export async function GET(request: NextRequest) {
  try {
    const session = await requireRole("ADMIN", "STAFF");
    await exigirArea(session, "FREQUENCIA");
    const classId = request.nextUrl.searchParams.get("classId");
    const date = request.nextUrl.searchParams.get("date");
    if (!classId || !date) {
      return NextResponse.json({ error: "classId e date são obrigatórios" }, { status: 400 });
    }
    const dia = dataParaMeiaNoiteUtc(date);

    const turma = await prisma.class.findFirst({ where: { id: classId, schoolId: session.schoolId } });
    if (!turma) return NextResponse.json({ error: "Turma não encontrada" }, { status: 404 });
    await exigirLecionaNaTurma(session, classId);

    const [students, records] = await Promise.all([
      prisma.student.findMany({
        where: { classId, deletedAt: null },
        select: { id: true, name: true },
        orderBy: { name: "asc" },
      }),
      prisma.attendance.findMany({
        where: { date: dia, student: { classId } },
        select: { studentId: true, status: true },
      }),
    ]);

    return NextResponse.json({ students, records });
  } catch (error) {
    return handleApiError(error);
  }
}

/**
 * Marca a frequência de uma turma inteira num dia (um registro por aluno).
 *
 * Lançamento repetido é bloqueado: sem `editar: true`, se algum aluno da chamada já tem
 * frequência nesse dia, responde 409 e nada é gravado. A gravação do primeiro lançamento é
 * um único INSERT (createMany), e o índice único (aluno, dia) do banco recusa a segunda de
 * duas requisições simultâneas (duplo clique, dois aparelhos), que também vira 409. A edição
 * explícita continua sobrescrevendo (upsert).
 */
export async function POST(request: NextRequest) {
  try {
    const session = await requireRole("ADMIN", "STAFF");
    await exigirArea(session, "FREQUENCIA");
    const body = markAttendanceSchema.parse(await request.json());
    const dia = dataParaMeiaNoiteUtc(body.date);

    const turma = await prisma.class.findFirst({ where: { id: body.classId, schoolId: session.schoolId } });
    if (!turma) return NextResponse.json({ error: "Turma não encontrada" }, { status: 404 });
    await exigirLecionaNaTurma(session, body.classId);

    const studentIds = body.marks.map((m) => m.studentId);
    if (new Set(studentIds).size !== studentIds.length) {
      return NextResponse.json({ error: "O mesmo aluno aparece mais de uma vez na chamada" }, { status: 400 });
    }
    const alunosDaTurma = await prisma.student.findMany({
      where: { id: { in: studentIds }, classId: body.classId, deletedAt: null },
      select: { id: true },
    });
    const idsValidos = new Set(alunosDaTurma.map((a) => a.id));
    if (studentIds.some((id) => !idsValidos.has(id))) {
      return NextResponse.json({ error: "Um ou mais alunos não pertencem a esta turma" }, { status: 400 });
    }

    const jaLancada = () =>
      NextResponse.json(
        { error: mensagemFrequenciaJaLancada(body.date), codigo: CODIGO_FREQUENCIA_JA_LANCADA },
        { status: 409 },
      );

    if (!body.editar) {
      const existentes = await prisma.attendance.count({
        where: { date: dia, studentId: { in: studentIds } },
      });
      if (existentes > 0) return jaLancada();
      try {
        await prisma.attendance.createMany({
          data: body.marks.map((m) => ({ studentId: m.studentId, date: dia, status: m.status, markedById: session.sub })),
        });
      } catch (error) {
        if (ehDuplicidadeDeFrequencia(error)) return jaLancada();
        throw error;
      }
      return NextResponse.json({ ok: true, editado: false });
    }

    await prisma.$transaction(
      body.marks.map((m) =>
        prisma.attendance.upsert({
          where: { studentId_date: { studentId: m.studentId, date: dia } },
          create: { studentId: m.studentId, date: dia, status: m.status, markedById: session.sub },
          update: { status: m.status, markedById: session.sub },
        }),
      ),
    );

    return NextResponse.json({ ok: true, editado: true });
  } catch (error) {
    return handleApiError(error);
  }
}
