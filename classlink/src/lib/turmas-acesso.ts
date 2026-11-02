import { prisma } from "@/lib/prisma";
import { ErroDeUsuario } from "@/lib/erros";
import type { AccessTokenPayload } from "@/lib/auth";

/**
 * Regras de acesso por turma, num lugar só (antes cada rota repetia a consulta):
 * - ADMIN: todas as turmas da escola;
 * - STAFF: só as turmas em que leciona (ClassTeacher);
 * - leitura de frequência/boletim de um aluno: também a coordenação e o responsável vinculado.
 */
type Sessao = Pick<AccessTokenPayload, "sub" | "role" | "schoolId">;

export async function lecionaNaTurma(professorId: string, classId: string): Promise<boolean> {
  const vinculo = await prisma.classTeacher.findFirst({ where: { classId, teacherId: professorId } });
  return Boolean(vinculo);
}

/** Ids (sem repetir) das turmas em que o professor leciona. */
export async function turmasQueLeciona(professorId: string): Promise<string[]> {
  const vinculos = await prisma.classTeacher.findMany({ where: { teacherId: professorId }, select: { classId: true } });
  return [...new Set(vinculos.map((v) => v.classId))];
}

/** Professor (STAFF) precisa lecionar na turma; ADMIN passa direto. Turma já conferida como da escola. */
export async function exigirLecionaNaTurma(sessao: Sessao, classId: string, mensagem = "Você não leciona nesta turma."): Promise<void> {
  if (sessao.role === "ADMIN") return;
  if (!(await lecionaNaTurma(sessao.sub, classId))) throw new ErroDeUsuario(mensagem, 403);
}

/** A turma existe nesta escola e quem publica pode usá-la (ADMIN, ou STAFF que leciona nela). */
export async function exigirTurmaPublicavel(sessao: Sessao, classId: string) {
  const turma = await prisma.class.findFirst({ where: { id: classId, schoolId: sessao.schoolId } });
  if (!turma) throw new ErroDeUsuario("Turma não encontrada.", 404);
  await exigirLecionaNaTurma(sessao, classId);
  return turma;
}

/** O aluno existe nesta escola e quem publica pode falar com ele (ADMIN, ou STAFF que leciona na turma dele). */
export async function exigirAlunoPublicavel(sessao: Sessao, alunoId: string) {
  const aluno = await prisma.student.findFirst({
    where: { id: alunoId, schoolId: sessao.schoolId, deletedAt: null },
    select: { id: true, classId: true },
  });
  if (!aluno) throw new ErroDeUsuario("Aluno não encontrado.", 404);
  await exigirLecionaNaTurma(sessao, aluno.classId, "Você não leciona na turma deste aluno.");
  return aluno;
}

/**
 * Quem pode VER dados de um aluno (frequência, boletim): direção, professor da turma do aluno,
 * coordenação e o responsável vinculado. `assunto` completa a mensagem ("à frequência", "ao boletim").
 */
export async function exigirPodeVerAluno(sessao: Sessao, studentId: string, assunto: string): Promise<void> {
  if (sessao.role === "ADMIN") return;
  const negado = new ErroDeUsuario(`Você não tem acesso ${assunto} deste aluno.`, 403);
  if (sessao.role === "STAFF") {
    const leciona = await prisma.classTeacher.findFirst({
      where: { teacherId: sessao.sub, class: { students: { some: { id: studentId } } } },
    });
    if (leciona) return;
    // isCoordenacao vem do banco (não do token): revogar vale na hora.
    const user = await prisma.user.findUnique({ where: { id: sessao.sub }, select: { isCoordenacao: true } });
    if (user?.isCoordenacao) return;
    throw negado;
  }
  if (sessao.role === "GUARDIAN") {
    const vinculo = await prisma.guardianStudent.findFirst({ where: { guardianId: sessao.sub, studentId } });
    if (vinculo) return;
    throw negado;
  }
  throw new ErroDeUsuario("Acesso negado.", 403);
}
