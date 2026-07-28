import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  signAccessToken,
  generateRefreshToken,
  hashRefreshToken,
  ACCESS_COOKIE,
  REFRESH_COOKIE,
  accessCookieOptions,
  refreshCookieOptions,
} from "@/lib/auth";
import { handleApiError } from "@/lib/http";

export async function POST(request: NextRequest) {
  try {
    const refreshToken = request.cookies.get(REFRESH_COOKIE)?.value;
    if (!refreshToken) {
      return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
    }

    const tokenHash = hashRefreshToken(refreshToken);
    const stored = await prisma.refreshToken.findUnique({
      where: { tokenHash },
      include: { user: true },
    });

    if (!stored || stored.revokedAt || stored.expiresAt < new Date() || !stored.user.active || stored.user.deletedAt) {
      return NextResponse.json({ error: "Sessão expirada" }, { status: 401 });
    }

    // Rotação: revoga o token usado e emite um novo (mitiga replay de refresh tokens roubados)
    await prisma.refreshToken.update({
      where: { id: stored.id },
      data: { revokedAt: new Date() },
    });

    const { token: newRefreshToken, tokenHash: newHash, expiresAt } = generateRefreshToken();
    await prisma.refreshToken.create({
      data: { tokenHash: newHash, userId: stored.user.id, expiresAt },
    });

    const accessToken = await signAccessToken({
      sub: stored.user.id,
      role: stored.user.role,
      schoolId: stored.user.schoolId,
      name: stored.user.name,
    });

    const response = NextResponse.json({ ok: true });
    response.cookies.set(ACCESS_COOKIE, accessToken, accessCookieOptions);
    response.cookies.set(REFRESH_COOKIE, newRefreshToken, refreshCookieOptions);
    return response;
  } catch (error) {
    return handleApiError(error);
  }
}
