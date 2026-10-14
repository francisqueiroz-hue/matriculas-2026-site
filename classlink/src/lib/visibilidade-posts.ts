import { prisma } from "@/lib/prisma";

/**
 * Turmas cujos avisos (inclusive o cardápio da turma) a pessoa pode ver no Mural.
 * Família: turmas dos filhos. Professor: turmas em que dá aula. Direção (ADMIN): todas (null).
 */
export async function turmasVisiveisNoMural(session: { sub: string; role: string }): Promise<string[] | null> {
  if (session.role === "GUARDIAN") {
    const links = await prisma.guardianStudent.findMany({
      where: { guardianId: session.sub, student: { deletedAt: null } },
      select: { student: { select: { classId: true } } },
    });
    return [...new Set(links.map((l) => l.student.classId))];
  }
  if (session.role === "STAFF") {
    const aulas = await prisma.classTeacher.findMany({ where: { teacherId: session.sub }, select: { classId: true } });
    return [...new Set(aulas.map((t) => t.classId))];
  }
  return null;
}

/** Filtro do Prisma: avisos da escola toda + avisos das turmas visíveis. Sem restrição para a direção. */
export function filtroDeVisibilidade(turmas: string[] | null) {
  return turmas === null ? {} : { OR: [{ audience: "SCHOOL" as const }, { audience: "CLASS" as const, classId: { in: turmas } }] };
}
