import { cookies } from "next/headers";
import { ACCESS_COOKIE, verifyAccessToken, type AccessTokenPayload } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  ehDirecao,
  ehDirecaoOuCoordenacao,
  ehGestao,
  podeLancarNotas,
  podePublicar,
  MENSAGEM_SO_DIRECAO,
  MENSAGEM_SO_GESTAO_PUBLICA,
  MENSAGEM_SO_NOTAS,
  type PerfilAcesso,
} from "@/lib/equipe";

/** Lê e valida o access token do cookie da requisição atual. Retorna null se ausente/inválido. */
export async function getSession(): Promise<AccessTokenPayload | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(ACCESS_COOKIE)?.value;
  if (!token) return null;
  const session = await verifyAccessToken(token);
  if (!session) return null;
  // O token vale 15 min; conferir no banco faz a exclusão/desativação valer na hora,
  // sem esperar o token expirar.
  const user = await prisma.user.findUnique({ where: { id: session.sub }, select: { active: true, deletedAt: true } });
  if (!user || !user.active || user.deletedAt) return null;
  return session;
}

export async function requireSession(): Promise<AccessTokenPayload> {
  const session = await getSession();
  if (!session) throw new AuthError("Não autenticado");
  return session;
}

export async function requireRole(...roles: AccessTokenPayload["role"][]) {
  const session = await requireSession();
  if (!roles.includes(session.role)) {
    throw new AuthError("Acesso negado para este perfil", 403);
  }
  return session;
}

/**
 * Direção/secretaria (ADMIN) ou coordenação pedagógica (STAFF com isCoordenacao = true).
 * Usado na consulta de alunos. Para lançar notas use `requireLancarNotas` (sem a secretaria).
 * isCoordenacao é checado direto no banco (não fica no JWT) para que
 * uma revogação de acesso valha imediatamente, sem esperar o token expirar.
 */
export async function requireCoordenacaoOuAdmin(mensagem = "Apenas direção ou coordenação podem lançar notas") {
  const session = await requireSession();
  if (session.role === "ADMIN") return session;
  if (session.role === "STAFF") {
    const user = await prisma.user.findUnique({ where: { id: session.sub }, select: { isCoordenacao: true } });
    if (user?.isCoordenacao) return session;
  }
  throw new AuthError(mensagem, 403);
}

/**
 * Perfil da pessoa logada, lido do banco a cada pedido: trocar a função de alguém (ex.: de
 * Coordenação para Professor) vale na hora, sem esperar o token expirar.
 */
export async function perfilDaSessao(session: Pick<AccessTokenPayload, "sub" | "role">): Promise<PerfilAcesso> {
  if (session.role === "GUARDIAN") return { role: "GUARDIAN", funcao: null, isCoordenacao: false };
  const user = await prisma.user.findUnique({
    where: { id: session.sub },
    select: { role: true, funcao: true, isCoordenacao: true },
  });
  if (!user) throw new AuthError("Usuário não encontrado", 401);
  return { role: user.role, funcao: user.funcao ?? null, isCoordenacao: Boolean(user.isCoordenacao) };
}

/** Gestão (direção, secretaria ou coordenação)? Lido do banco. */
export async function ehGestaoDaSessao(session: Pick<AccessTokenPayload, "sub" | "role">): Promise<boolean> {
  if (session.role === "ADMIN") return true;
  if (session.role !== "STAFF") return false;
  return ehGestao(await perfilDaSessao(session));
}

/** Lançar notas e cadastrar disciplinas: só direção e coordenação (a secretaria não lança). */
export async function requireLancarNotas() {
  const session = await requireSession();
  if (!podeLancarNotas(await perfilDaSessao(session))) throw new AuthError(MENSAGEM_SO_NOTAS, 403);
  return session;
}

/** Publicar no mural, comunicados, enquetes e agenda: gestão (ver `podePublicar`). */
export async function exigirPodePublicar(session: Pick<AccessTokenPayload, "sub" | "role">, mensagem = MENSAGEM_SO_GESTAO_PUBLICA) {
  if (session.role === "ADMIN") return;
  if (session.role !== "STAFF" || !podePublicar(await perfilDaSessao(session))) throw new AuthError(mensagem, 403);
}

/**
 * Financeiro (mensalidades, boletos, baixas, conferência), contratos com valores e lembretes de
 * cobrança: só a direção. A função é lida do banco (não fica no JWT), para que trocar alguém de
 * Direção para Secretaria valha na hora, sem esperar o token expirar.
 */
export async function requireDirecao() {
  const session = await requireRole("ADMIN");
  await exigirDirecaoSeAdmin(session);
  return session;
}

/**
 * Rotas compartilhadas com as famílias (ex.: PDF do boleto, arquivo do contrato): a família
 * passa pela checagem de vínculo da própria rota; quem é da administração precisa ser direção.
 */
export async function exigirDirecaoSeAdmin(session: Pick<AccessTokenPayload, "sub" | "role">) {
  if (session.role !== "ADMIN") return;
  const user = await prisma.user.findUnique({ where: { id: session.sub }, select: { role: true, funcao: true } });
  if (!user || !ehDirecao(user)) throw new AuthError(MENSAGEM_SO_DIRECAO, 403);
}

/**
 * Só direção (sem a secretaria) ou coordenação, com a função lida do banco. Usado nas enquetes
 * internas, nas mensagens para toda a equipe e na exportação do boletim em PDF.
 */
export async function exigirDirecaoOuCoordenacao(session: Pick<AccessTokenPayload, "sub" | "role">, mensagem: string) {
  if (session.role === "GUARDIAN" || !ehDirecaoOuCoordenacao(await perfilDaSessao(session))) throw new AuthError(mensagem, 403);
}

export class AuthError extends Error {
  status: number;
  constructor(message: string, status = 401) {
    super(message);
    this.status = status;
  }
}
