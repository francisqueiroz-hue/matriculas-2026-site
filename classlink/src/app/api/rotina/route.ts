import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { handleApiError } from "@/lib/http";
import { requireSession } from "@/lib/session";
import { exigirCoordenacao } from "@/lib/rotina-acesso";
import { exigirArea } from "@/lib/visibilidade-server";

const SEM_CACHE = { "Cache-Control": "private, no-store" };

/**
 * Entrada da tela "Rotina":
 * - família: os filhos vinculados (para escolher de qual ver a rotina);
 * - direção, secretaria e coordenação: os alunos ativos com a turma (para escolher quem preencher).
 * Professores: 403. Nada financeiro sai daqui.
 */
export async function GET() {
  try {
    const session = await requireSession();
    if (session.role === "GUARDIAN") {
      await exigirArea(session, "ROTINA");
      const links = await prisma.guardianStudent.findMany({
        where: { guardianId: session.sub, student: { schoolId: session.schoolId, deletedAt: null } },
        select: { student: { select: { id: true, name: true, class: { select: { name: true } } } } },
        orderBy: { student: { name: "asc" } },
      });
      return NextResponse.json(
        { papel: "FAMILIA", alunos: links.map((l) => ({ id: l.student.id, name: l.student.name, turma: l.student.class?.name ?? null })) },
        { headers: SEM_CACHE },
      );
    }
    if (session.role !== "ADMIN") await exigirCoordenacao(session);
    const alunos = await prisma.student.findMany({
      where: { schoolId: session.schoolId, deletedAt: null },
      select: { id: true, name: true, class: { select: { name: true } } },
      orderBy: { name: "asc" },
    });
    return NextResponse.json(
      { papel: "ESCOLA", alunos: alunos.map((a) => ({ id: a.id, name: a.name, turma: a.class?.name ?? null })) },
      { headers: SEM_CACHE },
    );
  } catch (error) {
    return handleApiError(error);
  }
}
