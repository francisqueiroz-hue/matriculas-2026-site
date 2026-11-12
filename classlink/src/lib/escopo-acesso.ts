import { prisma } from "@/lib/prisma";
import { turmasQueLeciona } from "@/lib/turmas-acesso";

/**
 * Escopo de acesso: a quais alunos e turmas cada pessoa está ligada.
 *
 * Fonte única das consultas "quem vê o quê" que antes estavam copiadas em várias rotas
 * (mural, agenda, cardápios, comunicados, enquetes e boletos):
 * - família (GUARDIAN): só os filhos vinculados que não foram excluídos;
 * - professor (STAFF): só as turmas em que dá aula (ver `turmasQueLeciona`);
 * - direção (ADMIN): a escola toda.
 * Cada tela decide o que fazer com o escopo (ex.: a coordenação vê todos os cardápios);
 * este módulo só responde "quais alunos/turmas". As regras de PERMISSÃO para um aluno ou uma
 * turma específica (frequência, boletim, publicar) ficam em `turmas-acesso.ts`.
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
  return [...new Set((await alunosDaFamilia(guardianId)).map((v) => v.classId))];
}

/**
 * Turmas que a pessoa acompanha: família → turmas dos filhos; equipe → turmas em que dá aula;
 * direção → null (sem restrição). Usado pelo Mural e pela Agenda.
 */
export async function turmasQueAcompanha(session: SessaoMinima): Promise<string[] | null> {
  if (session.role === "GUARDIAN") return turmasDaFamilia(session.sub);
  if (session.role === "STAFF") return turmasQueLeciona(session.sub);
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
 * - direção (e qualquer outro papel): sem restrição (`condicoes` = undefined), como antes.
 * Devolve também os vínculos da família, que as telas usam para contar filhos alcançados.
 */
export async function visibilidadePorPublico(
  session: SessaoMinima,
): Promise<{ condicoes: CondicaoPublico[] | undefined; vinculos: VinculoFamilia[] }> {
  if (session.role === "GUARDIAN") {
    const vinculos = await alunosDaFamilia(session.sub);
    return {
      vinculos,
      condicoes: [
        { audience: "SCHOOL" },
        { audience: "CLASS", classId: { in: [...new Set(vinculos.map((v) => v.classId))] } },
        { audience: "STUDENT", alunoId: { in: vinculos.map((v) => v.studentId) } },
      ],
    };
  }
  if (session.role === "STAFF") {
    const turmas = await turmasQueLeciona(session.sub);
    return {
      vinculos: [],
      condicoes: [
        { audience: "SCHOOL" },
        { audience: "CLASS", classId: { in: turmas } },
        { audience: "STUDENT", classId: { in: turmas } },
      ],
    };
  }
  return { condicoes: undefined, vinculos: [] };
}
