import { prisma } from "@/lib/prisma";
import type { AccessTokenPayload } from "@/lib/auth";

/** Filtro de visibilidade das enquetes, igual ao dos comunicados (escola, turma, aluno individual). */
export async function filtroDeVisibilidadeEnquetes(session: Pick<AccessTokenPayload, "sub" | "role" | "schoolId">) {
  if (session.role === "ADMIN") return undefined;
  if (session.role === "GUARDIAN") {
    const links = await prisma.guardianStudent.findMany({
      where: { guardianId: session.sub, student: { deletedAt: null } },
      select: { studentId: true, student: { select: { classId: true } } },
    });
    const classIds = [...new Set(links.map((l) => l.student.classId))];
    const studentIds = links.map((l) => l.studentId);
    return [
      { audience: "SCHOOL" as const },
      { audience: "CLASS" as const, classId: { in: classIds } },
      { audience: "STUDENT" as const, alunoId: { in: studentIds } },
    ];
  }
  const teaching = await prisma.classTeacher.findMany({ where: { teacherId: session.sub }, select: { classId: true } });
  const classIds = [...new Set(teaching.map((t) => t.classId))];
  return [
    { audience: "SCHOOL" as const },
    { audience: "CLASS" as const, classId: { in: classIds } },
    { audience: "STUDENT" as const, classId: { in: classIds } },
  ];
}

/** Responsáveis (sem repetir) que compõem o público da enquete. */
export async function publicoDaEnquete(e: { schoolId: string; audience: string; classId: string | null; alunoId: string | null }) {
  const links = await prisma.guardianStudent.findMany({
    where: {
      guardian: { schoolId: e.schoolId, active: true, deletedAt: null },
      student: {
        deletedAt: null,
        ...(e.audience === "CLASS" ? { classId: e.classId ?? undefined } : {}),
        ...(e.audience === "STUDENT" ? { id: e.alunoId ?? undefined } : {}),
      },
    },
    select: { guardian: { select: { id: true, name: true } } },
  });
  const porId = new Map<string, { id: string; name: string }>();
  for (const l of links) porId.set(l.guardian.id, l.guardian);
  return [...porId.values()];
}

/** Enquete da escola da sessão que a pessoa pode ver (mesma regra da listagem). Null se não existe/não é visível. */
export async function carregarEnqueteVisivel(session: Pick<AccessTokenPayload, "sub" | "role" | "schoolId">, id: string) {
  const OR = await filtroDeVisibilidadeEnquetes(session);
  return prisma.enquete.findFirst({
    where: { id, schoolId: session.schoolId, ...(OR ? { OR } : {}) },
    include: {
      class: { select: { id: true, name: true } },
      aluno: { select: { id: true, name: true } },
      perguntas: { orderBy: { ordem: "asc" } },
    },
  });
}
