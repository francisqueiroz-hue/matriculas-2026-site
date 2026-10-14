import { NextRequest, NextResponse } from "next/server";
import { ACCESS_COOKIE, REFRESH_COOKIE, accessCookieOptions, refreshCookieOptions } from "@/lib/auth";
import { destinoPosLogin } from "@/lib/destino-pos-login";
import { renovarSessao } from "@/lib/renovar-sessao-servidor";

/**
 * Renova a sessão numa navegação (GET) e volta para a página pedida. É para onde o proxy
 * manda quem abre /dashboard com o token de acesso (15 min) vencido — típico do PWA aberto
 * depois de um tempo. Sem refresh válido, segue para o login, guardando o destino.
 * O destino passa pela mesma validação do login (só caminhos de /dashboard, sem open redirect).
 */
export async function GET(request: NextRequest) {
  const destino = destinoPosLogin(request.nextUrl.searchParams.get("next"));
  const refreshToken = request.cookies.get(REFRESH_COOKIE)?.value;

  let renovada: Awaited<ReturnType<typeof renovarSessao>> = null;
  if (refreshToken) {
    try {
      renovada = await renovarSessao(refreshToken);
    } catch (error) {
      console.error("[renovar] falha ao renovar a sessão", error);
    }
  }

  if (!renovada) {
    const login = new URL("/login", request.url);
    login.searchParams.set("next", destino);
    return noStore(NextResponse.redirect(login));
  }

  const response = noStore(NextResponse.redirect(new URL(destino, request.url)));
  response.cookies.set(ACCESS_COOKIE, renovada.accessToken, accessCookieOptions);
  response.cookies.set(REFRESH_COOKIE, renovada.refreshToken, refreshCookieOptions);
  return response;
}

function noStore(response: NextResponse) {
  response.headers.set("Cache-Control", "no-store");
  return response;
}
