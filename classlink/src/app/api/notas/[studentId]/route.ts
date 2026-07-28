import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession, requireCoordenacaoOuAdmin, AuthError } from "@/lib/session";
import { handleApiError } from "@/lib/http";
import { setNotaSchema } from "@/lib/validators";
import { TRIMESTRES, calcMediaTrimestre, calcMediaFinal, calcSituacao } from "@/lib/notas";

/** Confere se o usuário logado pode VER o boletim deste aluno (leitura). Lançar notas exige requireCoordenacaoOuAdmin à parte. */
async function verificarAcessoLeitura(studentId: string, schoolId: string, session: Awaited<ReturnType<typeof requireSession>>) {
  if (session.role === "ADMIN") return;
  if (session.role === "STAFF") {
    const teaches = await prisma.classTeacher.findFirst({
      where: { teacherId: session.sub, class: { students: { some: { id: studentId } } } },
    });
    if (teaches) return;
    const user = await prisma.user.findUnique({ where: { id: session.sub }, select: { isCoordenacao: true } });
    if (user?.isCoordenacao) return;
    throw new AuthError("Você não tem acesso ao boletim deste aluno", 403);
  }
  if (session.role === "GUARDIAN") {
    const link = await prisma.guardianStudent.findFirst({ where: { guardianId: session.sub, studentId } });
    if (link) return;
    throw new AuthError("Você não tem acesso ao boletim deste aluno", 403);
  }
  throw new AuthError("Acesso negado", 403);
}

export async function GET(_request: NextRequest, ctx: RouteContext<"/api/notas/[studentId]">) {
  try {
    const session = await requireSession();
    const { studentId } = await ctx.params;

    const student = await prisma.student.findFirst({
      where: { id: studentId, schoolId: session.schoolId, deletedAt: null },
      select: { id: true, name: true, class: { select: { id: true, name: true } } },
    });
    if (!student) return NextResponse.json({ error: "Aluno não encontrado" }, { status: 404 });

    await verificarAcessoLeitura(studentId, session.schoolId, session);

    const [disciplinas, notas] = await Promise.all([
      prisma.disciplina.findMany({ where: { schoolId: session.schoolId }, orderBy: { nome: "asc" } }),
      prisma.nota.findMany({ where: { studentId } }),
    ]);

    const boletim = disciplinas.map((d) => {
      const porTrimestre = Object.fromEntries(
        TRIMESTRES.map((t) => {
          const nota = notas.find((n) => n.disciplinaId === d.id && n.trimestre === t);
          const trabalho = nota?.trabalho !== undefined && nota?.trabalho !== null ? Number(nota.trabalho) : null;
          const teste = nota?.teste !== undefined && nota?.teste !== null ? Number(nota.teste) : null;
          const prova = nota?.prova !== undefined && nota?.prova !== null ? Number(nota.prova) : null;
          return [t, { trabalho, teste, prova, media: calcMediaTrimestre(trabalho, teste, prova) }];
        }),
      );
      const mediaFinal = calcMediaFinal(TRIMESTRES.map((t) => porTrimestre[t].media));
      return {
        disciplinaId: d.id,
        nome: d.nome,
        trimestres: porTrimestre,
        mediaFinal,
        situacao: calcSituacao(mediaFinal),
      };
    });

    return NextResponse.json({ student, boletim });
  } catch (error) {
    return handleApiError(error);
  }
}

/** Lança/edita uma nota (trabalho/teste/prova) de uma disciplina/trimestre. Apenas direção ou coordenação. */
export async function PUT(request: NextRequest, ctx: RouteContext<"/api/notas/[studentId]">) {
  try {
    const session = await requireCoordenacaoOuAdmin();
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
