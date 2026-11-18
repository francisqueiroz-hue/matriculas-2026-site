import { prisma } from "@/lib/prisma";
import { AuthError, requireSession } from "@/lib/session";
import { exigirArea, papelDaSessao } from "@/lib/visibilidade-server";

export type PapelRotina = "ESCOLA" | "FAMILIA";

const RESTRITO = "Rotina restrita à direção, à secretaria, à coordenação e à família do aluno";

/**
 * Quem pode ler a rotina diária de um aluno:
 * - família: só os filhos vinculados (outro aluno responde 404, sem revelar que existe) e só se
 *   a direção não desligou a área "Rotina diária" para as famílias em Configurações;
 * - direção e secretaria (ADMIN): qualquer aluno da escola;
 * - coordenação (STAFF com isCoordenacao, conferido no banco a cada pedido): qualquer aluno da
 *   escola, se a direção não desligou a área "Rotina diária" para a coordenação em Configurações;
 * - professores e demais: 403.
 * Escrever (preencher, corrigir, apagar) é só da escola: `exigirEscola`.
 */
export async function acessoRotina(studentId: string) {
  const session = await requireSession();
  let papel: PapelRotina;
  if (session.role === "GUARDIAN") {
    await exigirArea(session, "ROTINA");
    const vinculo = await prisma.guardianStudent.findFirst({
      where: { guardianId: session.sub, studentId, student: { schoolId: session.schoolId, deletedAt: null } },
      select: { id: true },
    });
    if (!vinculo) throw new AuthError("Aluno não encontrado", 404);
    papel = "FAMILIA";
  } else if (session.role === "ADMIN") {
    papel = "ESCOLA";
  } else {
    await exigirCoordenacao(session);
    papel = "ESCOLA";
  }
  const aluno = await prisma.student.findFirst({
    where: { id: studentId, schoolId: session.schoolId, deletedAt: null },
    select: { id: true, name: true, class: { select: { name: true } } },
  });
  if (!aluno) throw new AuthError("Aluno não encontrado", 404);
  return { session, papel, aluno };
}

export function exigirEscola(papel: PapelRotina) {
  if (papel !== "ESCOLA") throw new AuthError("Só a direção, a secretaria e a coordenação preenchem a rotina", 403);
}

/**
 * Equipe (STAFF): só a coordenação, e só com a área "Rotina diária" liberada para ela. A função
 * é lida do banco a cada pedido (`papelDaSessao`), então tirar a coordenação de alguém vale na hora.
 * Professores: a célula é fixa em Configurações, então nunca passam.
 */
export async function exigirCoordenacao(session: { sub: string; role: string; schoolId: string }) {
  if (session.role !== "STAFF" || (await papelDaSessao(session)) !== "COORDENACAO") throw new AuthError(RESTRITO, 403);
  await exigirArea(session, "ROTINA");
}

/** Responsáveis ativos do aluno com acesso ao app: quem recebe o aviso da rotina. */
export async function responsaveisDoAluno(studentId: string): Promise<string[]> {
  const links = await prisma.guardianStudent.findMany({
    where: { studentId, guardian: { deletedAt: null, active: true } },
    select: { guardianId: true },
  });
  return [...new Set(links.map((l) => l.guardianId))];
}
