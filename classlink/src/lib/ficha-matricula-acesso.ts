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

/**
 * Etapa de cada aluno no ano letivo, pelo contrato do ano quando houver (a direção escolhe a etapa
 * no envio; vale para quem muda de etapa na renovação). Sem contrato, a ficha usa o nome da turma.
 */
export async function etapasDoContrato(schoolId: string, anoLetivo: number, studentIds?: string[]) {
  const contratos = await prisma.contrato.findMany({
    where: { schoolId, anoLetivo, ...(studentIds ? { studentId: { in: studentIds } } : {}) },
    orderBy: { createdAt: "asc" },
    select: { studentId: true, condicoes: true },
  });
  const etapas = new Map<string, unknown>();
  for (const c of contratos) {
    const etapa = c.condicoes && typeof c.condicoes === "object" ? (c.condicoes as { etapa?: unknown }).etapa : undefined;
    if (etapa) etapas.set(c.studentId, etapa); // o mais recente prevalece
  }
  return etapas;
}
