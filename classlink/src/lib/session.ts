import { cookies } from "next/headers";
import { ACCESS_COOKIE, verifyAccessToken, type AccessTokenPayload } from "@/lib/auth";

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

export class AuthError extends Error {
  status: number;
  constructor(message: string, status = 401) {
    super(message);
    this.status = status;
  }
}
