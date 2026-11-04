import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { handleApiError } from "@/lib/http";
import { novoAlunoSchema } from "@/lib/validators";
import { nomesSemelhantes } from "@/lib/nomes-semelhantes";

export async function GET(request: NextRequest) {
  try {
    const session = await requireRole("ADMIN", "STAFF");
    const classId = request.nextUrl.searchParams.get("classId") ?? undefined;

    const students = await prisma.student.findMany({
      where: { schoolId: session.schoolId, deletedAt: null, ...(classId ? { classId } : {}) },
      include: {
        class: { select: { id: true, name: true, year: true } },
        guardians: { include: { guardian: { select: { id: true, name: true, email: true, phone: true } } } },
      },
      orderBy: { name: "asc" },
    });
    return NextResponse.json({ students });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await requireRole("ADMIN");
    const body = novoAlunoSchema.parse(await request.json());

    // O mesmo aluno cadastrado duas vezes vira duas cobranças por mês (uma por cadastro).
    // Nome semelhante a um aluno ativo: devolve quem é, e só cria se a direção confirmar.
    if (!body.confirmarSemelhante) {
      const ativos = await prisma.student.findMany({
        where: { schoolId: session.schoolId, deletedAt: null },
        select: { id: true, name: true, class: { select: { name: true } } },
      });
      const semelhantes = ativos.filter((a) => nomesSemelhantes(a.name, body.name));
      if (semelhantes.length > 0) {
        return NextResponse.json(
          {
            error: "Já existe aluno com nome parecido.",
            semelhantes: semelhantes.map((a) => ({ id: a.id, name: a.name, turma: a.class.name })),
          },
          { status: 409 },
        );
      }
    }

    const cls = await prisma.class.findFirst({ where: { id: body.classId, schoolId: session.schoolId } });
    if (!cls) return NextResponse.json({ error: "Turma não encontrada" }, { status: 404 });

    const student = await prisma.student.create({
      data: {
        name: body.name,
        classId: body.classId,
        schoolId: session.schoolId,
        birthDate: body.birthDate ? new Date(body.birthDate) : undefined,
      },
    });
    return NextResponse.json({ student }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
