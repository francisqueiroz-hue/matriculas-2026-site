import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession, requireLancarNotas } from "@/lib/session";
import { exigirPodeVerAluno } from "@/lib/turmas-acesso";
import { handleApiError } from "@/lib/http";
import { setNotaSchema } from "@/lib/validators";
import { montarBoletim } from "@/lib/boletim";
import { exigirArea } from "@/lib/visibilidade-server";

export async function GET(_request: NextRequest, ctx: RouteContext<"/api/notas/[studentId]">) {
  try {
    const session = await requireSession();
    await exigirArea(session, "NOTAS");
    const { studentId } = await ctx.params;

    const student = await prisma.student.findFirst({
      where: { id: studentId, schoolId: session.schoolId, deletedAt: null },
      select: { id: true, name: true, class: { select: { id: true, name: true } } },
    });
    if (!student) return NextResponse.json({ error: "Aluno não encontrado" }, { status: 404 });

    await exigirPodeVerAluno(session, studentId, "ao boletim");

    const boletim = await montarBoletim(session.schoolId, studentId);

    return NextResponse.json({ student, boletim });
  } catch (error) {
    return handleApiError(error);
  }
}

/** Lança/edita uma nota (trabalho/teste/prova) de uma disciplina/trimestre. Apenas direção ou coordenação (a secretaria só vê). */
export async function PUT(request: NextRequest, ctx: RouteContext<"/api/notas/[studentId]">) {
  try {
    const session = await requireLancarNotas();
    await exigirArea(session, "NOTAS");
    const { studentId } = await ctx.params;
    const body = setNotaSchema.parse(await request.json());
    const disciplinaId = request.nextUrl.searchParams.get("disciplinaId");
    if (!disciplinaId) return NextResponse.json({ error: "disciplinaId obrigatório" }, { status: 400 });

    const student = await prisma.student.findFirst({ where: { id: studentId, schoolId: session.schoolId, deletedAt: null } });
    if (!student) return NextResponse.json({ error: "Aluno não encontrado" }, { status: 404 });

    const disciplina = await prisma.disciplina.findFirst({ where: { id: disciplinaId, schoolId: session.schoolId } });
    if (!disciplina) return NextResponse.json({ error: "Disciplina não encontrada" }, { status: 404 });

    const nota = await prisma.nota.upsert({
      where: { studentId_disciplinaId_trimestre: { studentId, disciplinaId, trimestre: body.trimestre } },
      create: {
        studentId,
        disciplinaId,
        trimestre: body.trimestre,
        trabalho: body.trabalho ?? null,
        teste: body.teste ?? null,
        prova: body.prova ?? null,
        lancadoPorId: session.sub,
      },
      update: {
        ...(body.trabalho !== undefined ? { trabalho: body.trabalho } : {}),
        ...(body.teste !== undefined ? { teste: body.teste } : {}),
        ...(body.prova !== undefined ? { prova: body.prova } : {}),
        lancadoPorId: session.sub,
      },
    });

    return NextResponse.json({ nota });
  } catch (error) {
    return handleApiError(error);
  }
}
