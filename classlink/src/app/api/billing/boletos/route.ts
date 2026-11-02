import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { handleApiError } from "@/lib/http";
import { alunosDaFamilia } from "@/lib/escopo-acesso";

/** "Meus boletos" — todos os boletos dos alunos vinculados ao responsável logado. */
export async function GET() {
  try {
    const session = await requireRole("GUARDIAN");

    const filhos = await alunosDaFamilia(session.sub);

    const boletos = await prisma.boleto.findMany({
      where: { studentId: { in: filhos.map((f) => f.studentId) } },
      include: { student: { select: { id: true, name: true } } },
      orderBy: [{ mesReferencia: "desc" }],
    });

    return NextResponse.json({ boletos });
  } catch (error) {
    return handleApiError(error);
  }
}
