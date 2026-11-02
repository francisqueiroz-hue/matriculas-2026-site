import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/session";
import { exigirPodeVerAluno } from "@/lib/turmas-acesso";
import { handleApiError } from "@/lib/http";
import { calcResumoFrequencia, abaixoDoMinimoLegal, mesReferenciaParaIntervalo, mesAtualReferencia } from "@/lib/attendance";

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

    await exigirPodeVerAluno(session, studentId, "à frequência");

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
