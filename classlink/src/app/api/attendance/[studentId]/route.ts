import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession, AuthError } from "@/lib/session";
import { handleApiError } from "@/lib/http";
import { calcResumoFrequencia, abaixoDoMinimoLegal, mesReferenciaParaIntervalo, mesAtualReferencia } from "@/lib/attendance";

/** Confere se o usuário logado pode VER o histórico de frequência deste aluno. */
async function verificarAcessoAluno(studentId: string, session: Awaited<ReturnType<typeof requireSession>>) {
  if (session.role === "ADMIN") return;
  if (session.role === "STAFF") {
    const leciona = await prisma.classTeacher.findFirst({
      where: { teacherId: session.sub, class: { students: { some: { id: studentId } } } },
    });
    if (leciona) return;
    const user = await prisma.user.findUnique({ where: { id: session.sub }, select: { isCoordenacao: true } });
    if (user?.isCoordenacao) return;
    throw new AuthError("Você não tem acesso à frequência deste aluno", 403);
  }
  if (session.role === "GUARDIAN") {
    const link = await prisma.guardianStudent.findFirst({ where: { guardianId: session.sub, studentId } });
    if (link) return;
    throw new AuthError("Você não tem acesso à frequência deste aluno", 403);
  }
  throw new AuthError("Acesso negado", 403);
}

/** Histórico e resumo de frequência de um aluno num mês (padrão: mês corrente). */
export async function GET(request: NextRequest, ctx: RouteContext<"/api/attendance/[studentId]">) {
  try {
    const session = await requireSession();
    const { studentId } = await ctx.params;
    const mes = request.nextUrl.searchParams.get("mes") ?? mesAtualReferencia();
    const { inicio, fim } = mesReferenciaParaIntervalo(mes);

    const student = await prisma.student.findFirst({
      where: { id: studentId, schoolId: session.schoolId, deletedAt: null },
      select: { id: true, name: true, class: { select: { id: true, name: true } } },
    });
    if (!student) return NextResponse.json({ error: "Aluno não encontrado" }, { status: 404 });

    await verificarAcessoAluno(studentId, session);

    const registros = await prisma.attendance.findMany({
      where: { studentId, date: { gte: inicio, lt: fim } },
      orderBy: { date: "asc" },
      select: { date: true, status: true },
    });

    const resumo = calcResumoFrequencia(registros.map((r) => r.status));

    return NextResponse.json({
      student,
      mes,
      registros,
      resumo,
      abaixoDoMinimo: abaixoDoMinimoLegal(resumo.percentual),
    });
  } catch (error) {
    return handleApiError(error);
  }
}
