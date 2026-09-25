import type { FuncaoEquipe, Prisma, Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { AuthError } from "@/lib/session";
import { FUNCAO_LABEL, funcaoDoUsuario } from "@/lib/equipe";

/**
 * Quem conversa com quem nas Mensagens do ClassLink (regra da escola):
 *  - gestão (direção e coordenação): envia e responde para todos — famílias e equipe;
 *  - professores e auxiliares: só com a gestão (nunca com famílias nem entre si);
 *  - famílias: só com a gestão (nunca com professores).
 * Toda conversa precisa ter alguém da gestão de um dos lados.
 */
export type PerfilMensagens = "gestao" | "professor" | "familia";

interface DadosPerfil {
  role: Role;
  isCoordenacao: boolean;
  funcao: FuncaoEquipe | null;
}

const SELECT_PERFIL = { role: true, isCoordenacao: true, funcao: true } as const;

export function perfilMensagens(user: DadosPerfil): PerfilMensagens {
  if (user.role === "GUARDIAN") return "familia";
  if (user.role === "ADMIN") return "gestao";
  const funcao = funcaoDoUsuario(user);
  return funcao === "DIRECAO" || funcao === "COORDENACAO" ? "gestao" : "professor";
}

export function podeConversar(a: PerfilMensagens, b: PerfilMensagens): boolean {
  if (a === "familia" && b === "familia") return false;
  return a === "gestao" || b === "gestao";
}

/** Filtro Prisma para usuários da gestão (direção ou coordenação). */
export const ONDE_GESTAO: Prisma.UserWhereInput = {
  OR: [
    { role: "ADMIN" },
    { role: "STAFF", funcao: { in: ["DIRECAO", "COORDENACAO"] } },
    { role: "STAFF", funcao: null, isCoordenacao: true },
  ],
};

/** Perfil lido do banco — a função pode mudar a qualquer momento, então não vem do token. */
export async function perfilDoUsuario(userId: string): Promise<PerfilMensagens> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: SELECT_PERFIL });
  if (!user) throw new AuthError("Usuário não encontrado", 404);
  return perfilMensagens(user);
}

export const MENSAGEM_BLOQUEIO =
  "Pelas regras da escola, as mensagens com as famílias e entre a equipe passam pela direção ou pela coordenação.";

/** Lança 403 se os dois usuários não podem conversar. */
export async function exigirPodeConversar(userIdA: string, userIdB: string): Promise<void> {
  const [a, b] = await Promise.all([perfilDoUsuario(userIdA), perfilDoUsuario(userIdB)]);
  if (!podeConversar(a, b)) throw new AuthError(MENSAGEM_BLOQUEIO, 403);
}

/**
 * Excluir conversa (com todas as mensagens, para os dois lados) é da gestão: direção e
 * coordenação limpam conversas de teste ou encerradas. Professores e famílias não apagam
 * registros da escola.
 */
export async function exigirPodeExcluirConversa(userId: string): Promise<void> {
  if ((await perfilDoUsuario(userId)) !== "gestao") {
    throw new AuthError("Só a direção e a coordenação podem excluir conversas.", 403);
  }
}

/** Cargo para exibir ao lado do nome ("Direção", "Coordenação", "Professor(a)", "Responsável"). */
export function cargoParaExibir(user: DadosPerfil): string {
  if (user.role === "GUARDIAN") return "Responsável";
  const funcao = funcaoDoUsuario(user);
  return funcao ? FUNCAO_LABEL[funcao] : "Equipe";
}

/**
 * Conversa onde deve cair uma mensagem da família que chega por fora do app (WhatsApp,
 * e-mail): a conversa indicada, se for com a gestão; senão a mais recente com a gestão;
 * senão uma nova com a direção.
 */
export async function conversaDaFamiliaComGestao(guardianId: string, schoolId: string, preferidaId?: string | null) {
  if (preferidaId) {
    const preferida = await prisma.conversation.findFirst({ where: { id: preferidaId, guardianId, staff: ONDE_GESTAO } });
    if (preferida) return preferida.id;
  }
  const ultima = await prisma.conversation.findFirst({
    where: { guardianId, staff: { ...ONDE_GESTAO, active: true, deletedAt: null } },
    orderBy: { createdAt: "desc" },
  });
  if (ultima) return ultima.id;

  const admin = await prisma.user.findFirst({
    where: { schoolId, role: "ADMIN", active: true, deletedAt: null },
    orderBy: { createdAt: "asc" },
  });
  if (!admin) return null;
  const nova = await prisma.conversation.upsert({
    where: { staffId_guardianId: { staffId: admin.id, guardianId } },
    update: {},
    create: { staffId: admin.id, guardianId },
  });
  return nova.id;
}
