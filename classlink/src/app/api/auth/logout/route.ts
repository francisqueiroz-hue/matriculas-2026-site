import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { ACCESS_COOKIE, REFRESH_COOKIE, hashRefreshToken, verifyAccessToken } from "@/lib/auth";
import { handleApiError } from "@/lib/http";
import { TAMANHO_MAXIMO_CORPO_LOGOUT, lerTokenPushDoLogout } from "@/lib/logout-corpo";

export async function POST(request: NextRequest) {
  try {
    const refreshToken = request.cookies.get(REFRESH_COOKIE)?.value;
    const tokenHash = refreshToken ? hashRefreshToken(refreshToken) : null;

    // Aparelho saindo da conta: apaga o token de push dele para não receber mais avisos
    // desta conta. Só o token deste aparelho e só se for do usuário da sessão atual.
    // Falha aqui não impede o logout.
    try {
      const pushToken = await tokenPushDoCorpo(request);
      if (pushToken) {
        const userId = await usuarioDaSessao(request.cookies.get(ACCESS_COOKIE)?.value, tokenHash);
        if (userId) await prisma.pushToken.deleteMany({ where: { token: pushToken, userId } });
      }
    } catch (error) {
      console.error("[logout] falha ao remover o token de push do aparelho", error);
    }

    if (tokenHash) {
      await prisma.refreshToken.updateMany({
        where: { tokenHash, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    }

    const response = NextResponse.json({ ok: true });
    response.cookies.delete(ACCESS_COOKIE);
    response.cookies.delete(REFRESH_COOKIE);
    return response;
  } catch (error) {
    return handleApiError(error);
  }
}

/** Token de push opcional do corpo; logout sem corpo (ou com corpo inválido) segue normal. */
async function tokenPushDoCorpo(request: NextRequest): Promise<string | null> {
  const tamanhoDeclarado = Number(request.headers.get("content-length") ?? "0");
  if (tamanhoDeclarado > TAMANHO_MAXIMO_CORPO_LOGOUT) return null;
  return lerTokenPushDoLogout(await request.text());
}

/**
 * Usuário da sessão que está saindo: pelo token de acesso (se ainda válido) ou pelo refresh
 * token (o de acesso dura só 15 min), desde que não revogado nem vencido.
 */
async function usuarioDaSessao(accessToken: string | undefined, refreshHash: string | null): Promise<string | null> {
  const sessao = accessToken ? await verifyAccessToken(accessToken) : null;
  if (sessao?.sub) return sessao.sub;
  if (!refreshHash) return null;
  const registro = await prisma.refreshToken.findUnique({
    where: { tokenHash: refreshHash },
    select: { userId: true, revokedAt: true, expiresAt: true },
  });
  if (!registro || registro.revokedAt || registro.expiresAt <= new Date()) return null;
  return registro.userId;
}
