import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/session";
import { handleApiError } from "@/lib/http";
import { getPublicoAlvo } from "@/lib/comunicados";

export async function GET(_request: NextRequest, ctx: RouteContext<"/api/comunicados/[id]">) {
  try {
    const session = await requireSession();
    const { id } = await ctx.params;

    const comunicado = await prisma.comunicado.findFirst({
      where: { id, schoolId: session.schoolId },
      include: {
        class: { select: { id: true, name: true } },
        aluno: { select: { id: true, name: true } },
        criadoPor: { select: { id: true, name: true } },
      },
    });
    if (!comunicado) return NextResponse.json({ error: "Comunicado não encontrado" }, { status: 404 });

    if (session.role === "GUARDIAN") {
      const [alunosElegiveis, respostas] = await Promise.all([
        prisma.guardianStudent.findMany({
          where: {
            guardianId: session.sub,
            student: {
              deletedAt: null,
              ...(comunicado.audience === "CLASS" ? { classId: comunicado.classId ?? undefined } : {}),
              ...(comunicado.audience === "STUDENT" ? { id: comunicado.alunoId ?? undefined } : {}),
            },
          },
          select: { student: { select: { id: true, name: true } } },
        }),
        prisma.respostaComunicado.findMany({
          where: { comunicadoId: id, responsavelId: session.sub },
        }),
      ]);

      const respostaPorAluno = new Map(respostas.map((r) => [r.alunoId, r]));
      const alunos = alunosElegiveis.map((l) => ({
        aluno: l.student,
        resposta: respostaPorAluno.get(l.student.id) ?? null,
      }));

      return NextResponse.json({ comunicado, alunos });
    }

    const publicoAlvo = await getPublicoAlvo(id);
    const respostas = await prisma.respostaComunicado.count({
      where: { comunicadoId: id, resposta: { not: "PENDENTE_EXPIRADO" } },
    });

    return NextResponse.json({
      comunicado,
      totalPublicoAlvo: publicoAlvo.length,
      totalRespostas: respostas,
    });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(_request: NextRequest, ctx: RouteContext<"/api/comunicados/[id]">) {
  try {
    const session = await requireSession();
    const { id } = await ctx.params;

    const comunicado = await prisma.comunicado.findFirst({ where: { id, schoolId: session.schoolId } });
    if (!comunicado) return NextResponse.json({ error: "Comunicado não encontrado" }, { status: 404 });
    if (comunicado.criadoPorId !== session.sub && session.role !== "ADMIN") {
      return NextResponse.json({ error: "Sem permissão para remover este comunicado" }, { status: 403 });
    }

    await prisma.comunicado.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
}
