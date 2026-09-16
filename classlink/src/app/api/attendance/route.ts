import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole, AuthError } from "@/lib/session";
import { handleApiError } from "@/lib/http";
import { markAttendanceSchema } from "@/lib/validators";
import { dataParaMeiaNoiteUtc } from "@/lib/attendance";

/** Confere se o usuário logado pode marcar/consultar frequência desta turma. Turma já confirmada como existente/da escola. */
async function verificarAcessoTurma(classId: string, session: Awaited<ReturnType<typeof requireRole>>) {
  if (session.role === "ADMIN") return;
  const leciona = await prisma.classTeacher.findFirst({ where: { classId, teacherId: session.sub } });
  if (!leciona) throw new AuthError("Você não leciona nesta turma", 403);
}

/** Roster da turma numa data (para a tela de marcação): alunos + status já lançado, quando houver. */
export async function GET(request: NextRequest) {
  try {
    const session = await requireRole("ADMIN", "STAFF");
    const classId = request.nextUrl.searchParams.get("classId");
    const date = request.nextUrl.searchParams.get("date");
    if (!classId || !date) {
      return NextResponse.json({ error: "classId e date são obrigatórios" }, { status: 400 });
    }
    const dia = dataParaMeiaNoiteUtc(date);

    const turma = await prisma.class.findFirst({ where: { id: classId, schoolId: session.schoolId } });
    if (!turma) return NextResponse.json({ error: "Turma não encontrada" }, { status: 404 });
    await verificarAcessoTurma(classId, session);

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

/** Marca a frequência de uma turma inteira num dia (upsert em lote, um registro por aluno). */
export async function POST(request: NextRequest) {
  try {
    const session = await requireRole("ADMIN", "STAFF");
    const body = markAttendanceSchema.parse(await request.json());
    const dia = dataParaMeiaNoiteUtc(body.date);

    const turma = await prisma.class.findFirst({ where: { id: body.classId, schoolId: session.schoolId } });
    if (!turma) return NextResponse.json({ error: "Turma não encontrada" }, { status: 404 });
    await verificarAcessoTurma(body.classId, session);

    const studentIds = body.marks.map((m) => m.studentId);
    const alunosDaTurma = await prisma.student.findMany({
      where: { id: { in: studentIds }, classId: body.classId, deletedAt: null },
      select: { id: true },
    });
    const idsValidos = new Set(alunosDaTurma.map((a) => a.id));
    if (studentIds.some((id) => !idsValidos.has(id))) {
      return NextResponse.json({ error: "Um ou mais alunos não pertencem a esta turma" }, { status: 400 });
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

    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
}
