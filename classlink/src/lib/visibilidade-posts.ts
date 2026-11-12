import { turmasQueAcompanha } from "@/lib/escopo-acesso";

/**
 * Turmas cujos avisos (inclusive o cardápio da turma) a pessoa pode ver no Mural.
 * Família: turmas dos filhos. Professor: turmas em que dá aula. Direção (ADMIN): todas (null).
 */
export async function turmasVisiveisNoMural(session: { sub: string; role: string }): Promise<string[] | null> {
  return turmasQueAcompanha(session);
}

/** Filtro do Prisma: avisos da escola toda + avisos das turmas visíveis. Sem restrição para a direção. */
export function filtroDeVisibilidade(turmas: string[] | null) {
  return turmas === null ? {} : { OR: [{ audience: "SCHOOL" as const }, { audience: "CLASS" as const, classId: { in: turmas } }] };
}
