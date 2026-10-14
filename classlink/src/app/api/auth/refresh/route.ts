import { NextRequest, NextResponse } from "next/server";
import { ACCESS_COOKIE, REFRESH_COOKIE, accessCookieOptions, refreshCookieOptions } from "@/lib/auth";
import { handleApiError } from "@/lib/http";
import { renovarSessao } from "@/lib/renovar-sessao-servidor";

export async function POST(request: NextRequest) {
  try {
    const refreshToken = request.cookies.get(REFRESH_COOKIE)?.value;
    if (!refreshToken) {
      return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
    }

    // Rotação: o token usado é revogado e um novo é emitido (mitiga replay de tokens roubados).
    const renovada = await renovarSessao(refreshToken);
    if (!renovada) {
      return NextResponse.json({ error: "Sessão expirada" }, { status: 401 });
    }

    const response = NextResponse.json({ ok: true });
    response.cookies.set(ACCESS_COOKIE, renovada.accessToken, accessCookieOptions);
    response.cookies.set(REFRESH_COOKIE, renovada.refreshToken, refreshCookieOptions);
    return response;
  } catch (error) {
    return handleApiError(error);
  }
}
