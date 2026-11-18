import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { AccessTokenPayload } from "@/lib/auth";
import { visibilidadePorPublico } from "@/lib/escopo-acesso";
import { ehGestao, respondeEnqueteInterna } from "@/lib/equipe";
import { perfilDaSessao } from "@/lib/session";

type SessaoEnquete = Pick<AccessTokenPayload, "sub" | "role" | "schoolId">;

/**
 * Quem vê quais enquetes (regra da escola, 18/11/2026):
 *  - família: só as enquetes às famílias (escola, turmas dos filhos e individuais dos filhos),
 *    nunca as internas;
 *  - professores e auxiliares: só as enquetes internas, que respondem. As enquetes às famílias
 *    (e seus resultados) ficam com a gestão;
 *  - direção, secretaria e coordenação: todas (secretaria e coordenação também respondem as internas).
 */
export async function filtroDeVisibilidadeEnquetes(session: SessaoEnquete): Promise<Prisma.EnqueteWhereInput> {
  if (session.role === "GUARDIAN") {
    const { condicoes } = await visibilidadePorPublico(session);
    return { interna: false, ...(condicoes ? { OR: condicoes } : {}) };
  }
  const perfil = await perfilDaSessao(session);
  if (ehGestao(perfil)) return {};
  if (respondeEnqueteInterna(perfil)) return { interna: true };
  // Perfil desconhecido: não vê nada (padrão seguro).
  return { id: { in: [] } };
}

/**
 * A pessoa logada responde esta enquete? Família: as enquetes às famílias. Interna: professores,
 * auxiliares, coordenação e secretaria, menos quem criou a enquete.
 */
export async function respondeEstaEnquete(
  session: SessaoEnquete,
  enquete: { interna: boolean; criadoPorId?: string | null },
): Promise<boolean> {
  if (session.role === "GUARDIAN") return !enquete.interna;
  if (!enquete.interna || enquete.criadoPorId === session.sub) return false;
  return respondeEnqueteInterna(await perfilDaSessao(session));
}

/** Público das enquetes internas: equipe (menos a direção) e secretaria. */
export const ONDE_RESPONDE_INTERNA: Prisma.UserWhereInput = {
  OR: [
    { role: "STAFF", funcao: null },
    { role: "STAFF", funcao: { not: "DIRECAO" } },
    { role: "ADMIN", funcao: "SECRETARIA" },
  ],
};

/** Pessoas (sem repetir) que compõem o público da enquete: responsáveis, ou a equipe na interna. */
export async function publicoDaEnquete(e: {
  schoolId: string;
  audience: string;
  classId: string | null;
  alunoId: string | null;
  interna?: boolean;
  criadoPorId?: string | null;
}) {
  if (e.interna) {
    return prisma.user.findMany({
      where: {
        schoolId: e.schoolId,
        active: true,
        deletedAt: null,
        ...ONDE_RESPONDE_INTERNA,
        ...(e.criadoPorId ? { id: { not: e.criadoPorId } } : {}),
      },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    });
  }
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
export async function carregarEnqueteVisivel(session: SessaoEnquete, id: string) {
  const filtro = await filtroDeVisibilidadeEnquetes(session);
  return prisma.enquete.findFirst({
    where: { AND: [{ id, schoolId: session.schoolId }, filtro] },
    include: {
      class: { select: { id: true, name: true } },
      aluno: { select: { id: true, name: true } },
      perguntas: { orderBy: { ordem: "asc" } },
    },
  });
}
