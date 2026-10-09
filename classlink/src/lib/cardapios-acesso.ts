import { prisma } from "@/lib/prisma";
import { AuthError } from "@/lib/session";
import { perfilDoUsuario } from "@/lib/permissoes-mensagens";
import { getSignedMediaUrl } from "@/lib/firebase-storage";
import { dateParaData, type ConteudoCardapio } from "@/lib/cardapios";

/** Cardápios são cadastrados pela gestão (direção e coordenação). */
export async function exigirGestaoCardapio(userId: string) {
  if ((await perfilDoUsuario(userId)) !== "gestao") {
    throw new AuthError("Só a direção e a coordenação cadastram cardápios.", 403);
  }
}

/** Turmas que o usuário acompanha (família: dos filhos; professor: em que dá aula). null = todas. */
export async function turmasVisiveis(session: { sub: string; role: string }): Promise<string[] | null> {
  if (session.role === "GUARDIAN") {
    const links = await prisma.guardianStudent.findMany({
      where: { guardianId: session.sub, student: { deletedAt: null } },
      select: { student: { select: { classId: true } } },
    });
    return [...new Set(links.map((l) => l.student.classId))];
  }
  if (session.role === "STAFF" && (await perfilDoUsuario(session.sub)) !== "gestao") {
    const aulas = await prisma.classTeacher.findMany({ where: { teacherId: session.sub }, select: { classId: true } });
    return aulas.map((a) => a.classId);
  }
  return null;
}

type CardapioComTurma = {
  id: string;
  semanaInicio: Date;
  classId: string | null;
  class: { name: string } | null;
  conteudo: unknown;
  observacoes: string | null;
  imagemPath: string | null;
  status: "AGENDADO" | "PUBLICADO";
  publicadoEm: Date | null;
};

/** Formato enviado à tela (foto com link assinado, que expira). */
export async function paraTela(c: CardapioComTurma) {
  let imagemUrl: string | null = null;
  if (c.imagemPath) {
    imagemUrl = await getSignedMediaUrl(c.imagemPath).catch(() => null);
  }
  return {
    id: c.id,
    semanaInicio: dateParaData(c.semanaInicio),
    classId: c.classId,
    turma: c.class?.name ?? null,
    conteudo: c.conteudo as ConteudoCardapio,
    observacoes: c.observacoes,
    imagemPath: c.imagemPath,
    imagemUrl,
    status: c.status,
    publicadoEm: c.publicadoEm,
  };
}
