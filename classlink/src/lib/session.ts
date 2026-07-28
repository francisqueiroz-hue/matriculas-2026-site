import { cookies } from "next/headers";
import { ACCESS_COOKIE, verifyAccessToken, type AccessTokenPayload } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

/** Lê e valida o access token do cookie da requisição atual. Retorna null se ausente/inválido. */
export async function getSession(): Promise<AccessTokenPayload | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(ACCESS_COOKIE)?.value;
  if (!token) return null;
  return verifyAccessToken(token);
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
 * Lançamento de notas é restrito à direção (ADMIN) ou à coordenação pedagógica
 * (STAFF com isCoordenacao = true) — nunca ao professor regular da turma nem ao
 * responsável. isCoordenacao é checado direto no banco (não fica no JWT) para que
 * uma revogação de acesso valha imediatamente, sem esperar o token expirar.
 */
export async function requireCoordenacaoOuAdmin() {
  const session = await requireSession();
  if (session.role === "ADMIN") return session;
  if (session.role === "STAFF") {
    const user = await prisma.user.findUnique({ where: { id: session.sub }, select: { isCoordenacao: true } });
    if (user?.isCoordenacao) return session;
  }
  throw new AuthError("Apenas direção ou coordenação podem lançar notas", 403);
}

export class AuthError extends Error {
  status: number;
  constructor(message: string, status = 401) {
    super(message);
    this.status = status;
  }
}
