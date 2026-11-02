import { prisma } from "@/lib/prisma";
import { AuthError } from "@/lib/session";

/**
 * Escopo de acesso: a quais alunos e turmas cada pessoa está ligada.
 *
 * Fonte única das regras "quem vê o quê" que antes estavam copiadas em várias rotas
 * (mural, agenda, cardápios, comunicados, enquetes, boletos, frequência e boletim):
 * - família (GUARDIAN): só os filhos vinculados que não foram excluídos;
 * - professor (STAFF): só as turmas em que dá aula;
 * - direção (ADMIN): a escola toda.
 * Cada tela decide o que fazer com o escopo (ex.: a coordenação vê todos os cardápios);
 * este módulo só responde "quais alunos/turmas".
 */

type SessaoMinima = { sub: string; role: string };

export type VinculoFamilia = { studentId: string; classId: string };

/** Filhos ativos (não excluídos) vinculados ao responsável, com a turma de cada um. */
export async function alunosDaFamilia(guardianId: string): Promise<VinculoFamilia[]> {
  const links = await prisma.guardianStudent.findMany({
    where: { guardianId, student: { deletedAt: null } },
    select: { studentId: true, student: { select: { classId: true } } },
  });
  return links.map((l) => ({ studentId: l.studentId, classId: l.student.classId }));
}

/** Turmas (sem repetir) dos filhos ativos do responsável. */
export async function turmasDaFamilia(guardianId: string): Promise<string[]> {
  return unicos((await alunosDaFamilia(guardianId)).map((v) => v.classId));
}

/** Turmas (sem repetir) em que o professor dá aula. */
export async function turmasDoProfessor(teacherId: string): Promise<string[]> {
  const aulas = await prisma.classTeacher.findMany({ where: { teacherId }, select: { classId: true } });
  return unicos(aulas.map((a) => a.classId));
}

/**
 * Turmas que a pessoa acompanha: família → turmas dos filhos; equipe → turmas em que dá aula;
 * direção → null (sem restrição). Usado pelo Mural e pela Agenda.
 */
export async function turmasQueAcompanha(session: SessaoMinima): Promise<string[] | null> {
  if (session.role === "GUARDIAN") return turmasDaFamilia(session.sub);
  if (session.role === "STAFF") return turmasDoProfessor(session.sub);
  return null;
}

/** Condições do Prisma para itens endereçados à escola, a uma turma ou a um aluno (campo `audience`). */
export type CondicaoPublico =
  | { audience: "SCHOOL" }
  | { audience: "CLASS"; classId: { in: string[] } }
  | { audience: "STUDENT"; alunoId: { in: string[] } }
  | { audience: "STUDENT"; classId: { in: string[] } };

/**
 * Visibilidade de itens com público-alvo escola/turma/aluno (comunicados e enquetes).
 * - família: escola + turmas dos filhos + itens individuais dos próprios filhos
 *   (nunca os individuais de outros alunos da mesma turma);
 * - equipe: escola + turmas em que dá aula + individuais de alunos dessas turmas;
 * - direção: sem restrição (`condicoes` = undefined).
 * Devolve também os vínculos da família, que as telas usam para contar filhos alcançados.
 */
export async function visibilidadePorPublico(
  session: SessaoMinima,
): Promise<{ condicoes: CondicaoPublico[] | undefined; vinculos: VinculoFamilia[] }> {
  if (session.role === "ADMIN") return { condicoes: undefined, vinculos: [] };
  if (session.role === "GUARDIAN") {
    const vinculos = await alunosDaFamilia(session.sub);
    return {
      vinculos,
      condicoes: [
        { audience: "SCHOOL" },
        { audience: "CLASS", classId: { in: unicos(vinculos.map((v) => v.classId)) } },
        { audience: "STUDENT", alunoId: { in: vinculos.map((v) => v.studentId) } },
      ],
    };
  }
  const turmas = await turmasDoProfessor(session.sub);
  return {
    vinculos: [],
    condicoes: [
      { audience: "SCHOOL" },
      { audience: "CLASS", classId: { in: turmas } },
      { audience: "STUDENT", classId: { in: turmas } },
    ],
  };
}

/**
 * Exige que a pessoa possa VER os dados de um aluno (frequência, boletim):
 * direção sempre; equipe se leciona na turma do aluno ou é da coordenação;
 * família se o aluno é filho vinculado. Caso contrário lança AuthError 403 com `mensagem`.
 * Não confere se o aluno existe/pertence à escola: a rota faz isso antes (e responde 404).
 */
export async function exigirAcessoAoAluno(session: SessaoMinima, studentId: string, mensagem: string): Promise<void> {
  if (session.role === "ADMIN") return;
  if (session.role === "STAFF") {
    const leciona = await prisma.classTeacher.findFirst({
      where: { teacherId: session.sub, class: { students: { some: { id: studentId } } } },
    });
    if (leciona) return;
    const user = await prisma.user.findUnique({ where: { id: session.sub }, select: { isCoordenacao: true } });
    if (user?.isCoordenacao) return;
    throw new AuthError(mensagem, 403);
  }
  if (session.role === "GUARDIAN") {
    const link = await prisma.guardianStudent.findFirst({ where: { guardianId: session.sub, studentId } });
    if (link) return;
    throw new AuthError(mensagem, 403);
  }
  throw new AuthError("Acesso negado", 403);
}

function unicos(ids: string[]): string[] {
  return [...new Set(ids)];
}
