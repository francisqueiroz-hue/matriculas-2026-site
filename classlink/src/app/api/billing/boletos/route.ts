import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { handleApiError } from "@/lib/http";

/** "Meus boletos" — todos os boletos dos alunos vinculados ao responsável logado. */
export async function GET() {
  try {
    const session = await requireRole("GUARDIAN");

    const links = await prisma.guardianStudent.findMany({
      where: { guardianId: session.sub, student: { deletedAt: null } },
      select: { studentId: true },
    });

    const boletos = await prisma.boleto.findMany({
      // Cancelado pela escola (ex.: lançado em duplicidade) não aparece para a família.
      where: { studentId: { in: links.map((l) => l.studentId) }, status: { not: "CANCELADO" } },
      include: { student: { select: { id: true, name: true } } },
      orderBy: [{ mesReferencia: "desc" }],
    });

    return NextResponse.json({ boletos });
  } catch (error) {
    return handleApiError(error);
  }
}
