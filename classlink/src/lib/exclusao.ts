import { randomBytes } from "crypto";
import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/auth";

/**
 * Exclusão de quem saiu da escola (equipe, responsáveis e alunos).
 *
 * Não é um DELETE físico: apagar o usuário apagaria em cascata conversas, mensagens e
 * respostas a comunicados, e apagar o aluno levaria notas e frequência — registros que a
 * escola precisa guardar (escrituração escolar). Em vez disso:
 *  - a pessoa some de todas as listas e perde o acesso na hora;
 *  - os dados de contato (e-mail, celular) são apagados — LGPD, minimização — e ficam
 *    livres para um novo cadastro, caso a pessoa volte;
 *  - o nome fica só no histórico (quem lançou a nota, quem escreveu a mensagem).
 */

/** Exclui um usuário (equipe ou responsável). Retorna false se não existir nessa escola. */
export async function excluirUsuario(userId: string, schoolId: string): Promise<boolean> {
  const user = await prisma.user.findFirst({ where: { id: userId, schoolId, deletedAt: null }, select: { id: true } });
  if (!user) return false;

  // Senha aleatória descartada: mesmo que algo reative a conta, ninguém sabe a senha.
  const senhaDescartada = await hashPassword(randomBytes(24).toString("hex"));
  const agora = new Date();
  await prisma.$transaction([
    prisma.user.update({
      where: { id: user.id },
      data: {
        active: false,
        deletedAt: agora,
        email: null,
        phone: null,
        avatarUrl: null,
        avisosWhatsApp: false,
        whatsappUltimaMensagemEm: null,
        passwordHash: senhaDescartada,
      },
    }),
    prisma.refreshToken.updateMany({ where: { userId: user.id, revokedAt: null }, data: { revokedAt: agora } }),
    prisma.pushToken.deleteMany({ where: { userId: user.id } }),
    // Sai das turmas em que dava aula e dos vínculos com alunos (só os vínculos, não os alunos).
    prisma.classTeacher.deleteMany({ where: { teacherId: user.id } }),
    prisma.guardianStudent.deleteMany({ where: { guardianId: user.id } }),
  ]);
  return true;
}

/** Responsável sem nenhum outro aluno ativo na escola (além de `excetoAlunoId`)? */
async function semOutroAluno(guardianId: string, excetoAlunoId: string): Promise<boolean> {
  const outros = await prisma.guardianStudent.count({
    where: { guardianId, studentId: { not: excetoAlunoId }, student: { deletedAt: null } },
  });
  return outros === 0;
}

export interface ResultadoExclusaoAluno {
  responsaveisExcluidos: string[];
  responsaveisMantidos: string[];
}

/**
 * Exclui um aluno (sai das listas; notas, frequência e boletos ficam no histórico). Com
 * `excluirResponsaveis`, também exclui o acesso dos responsáveis que não têm outro aluno
 * ativo na escola — irmãos que continuam mantêm o acesso da família.
 */
export async function excluirAluno(
  alunoId: string,
  schoolId: string,
  excluirResponsaveis: boolean,
): Promise<ResultadoExclusaoAluno | null> {
  const aluno = await prisma.student.findFirst({
    where: { id: alunoId, schoolId, deletedAt: null },
    select: { id: true, guardians: { select: { guardian: { select: { id: true, name: true, deletedAt: true } } } } },
  });
  if (!aluno) return null;

  await prisma.student.update({ where: { id: aluno.id }, data: { deletedAt: new Date() } });

  const resultado: ResultadoExclusaoAluno = { responsaveisExcluidos: [], responsaveisMantidos: [] };
  for (const { guardian } of aluno.guardians) {
    if (guardian.deletedAt) continue;
    if (excluirResponsaveis && (await semOutroAluno(guardian.id, aluno.id))) {
      await excluirUsuario(guardian.id, schoolId);
      resultado.responsaveisExcluidos.push(guardian.name);
    } else {
      resultado.responsaveisMantidos.push(guardian.name);
    }
  }
  return resultado;
}

/**
 * Desvincula um responsável de um aluno e, com `excluirSeSemAlunos`, exclui o acesso dele
 * se não sobrar nenhum aluno ativo. Retorna se o responsável foi excluído.
 */
export async function desvincularResponsavel(
  alunoId: string,
  responsavelId: string,
  schoolId: string,
  excluirSeSemAlunos: boolean,
): Promise<boolean> {
  await prisma.guardianStudent.delete({ where: { guardianId_studentId: { guardianId: responsavelId, studentId: alunoId } } });
  if (excluirSeSemAlunos && (await semOutroAluno(responsavelId, alunoId))) {
    return excluirUsuario(responsavelId, schoolId);
  }
  return false;
}
