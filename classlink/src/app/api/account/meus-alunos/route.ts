import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { handleApiError } from "@/lib/http";

/** Alunos vinculados ao responsável logado — usado nos seletores de boletim/financeiro. */
export async function GET() {
  try {
    const session = await requireRole("GUARDIAN");
    const links = await prisma.guardianStudent.findMany({
      where: { guardianId: session.sub, student: { deletedAt: null } },
      select: { student: { select: { id: true, name: true, class: { select: { id: true, name: true } } } } },
      orderBy: { student: { name: "asc" } },
    });
    return NextResponse.json({ students: links.map((l) => l.student) });
  } catch (error) {
    return handleApiError(error);
  }
}
