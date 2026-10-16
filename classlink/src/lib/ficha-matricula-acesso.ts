import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import type { PapelEquipe } from "@/lib/ficha-matricula";

/** Ficha da matrícula: só a equipe (direção e STAFF). Devolve a sessão com o papel tipado. */
export async function exigirEquipe() {
  const session = await requireRole("ADMIN", "STAFF");
  return { ...session, papel: session.role as PapelEquipe };
}

/** Aluno ativo da escola da sessão (null se não existir ou for de outra escola). */
export function alunoDaEscola(studentId: string, schoolId: string) {
  return prisma.student.findFirst({
    where: { id: studentId, schoolId, deletedAt: null },
    select: {
      id: true,
      name: true,
      class: { select: { id: true, name: true, year: true } },
      guardians: {
        where: { guardian: { deletedAt: null } },
        select: { relation: true, guardian: { select: { id: true, name: true } } },
      },
    },
  });
}
