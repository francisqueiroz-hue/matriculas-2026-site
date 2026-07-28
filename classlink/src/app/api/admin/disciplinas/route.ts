import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession, requireCoordenacaoOuAdmin } from "@/lib/session";
import { handleApiError } from "@/lib/http";
import { createDisciplinaSchema } from "@/lib/validators";

/** Qualquer usuário autenticado da escola pode ver a lista (é usada no boletim e nos filtros). */
export async function GET() {
  try {
    const session = await requireSession();
    const disciplinas = await prisma.disciplina.findMany({
      where: { schoolId: session.schoolId },
      orderBy: { nome: "asc" },
    });
    return NextResponse.json({ disciplinas });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await requireCoordenacaoOuAdmin();
    const body = createDisciplinaSchema.parse(await request.json());

    const existing = await prisma.disciplina.findFirst({ where: { schoolId: session.schoolId, nome: body.nome } });
    if (existing) return NextResponse.json({ error: "Disciplina já cadastrada" }, { status: 409 });

    const disciplina = await prisma.disciplina.create({
      data: { nome: body.nome, schoolId: session.schoolId },
    });
    return NextResponse.json({ disciplina }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
