import { NextRequest, NextResponse } from "next/server";
import { ACCESS_COOKIE, verifyAccessToken } from "@/lib/auth";
import { caminhoParaRenovar } from "@/lib/renovacao-sessao";

export async function proxy(request: NextRequest) {
  const token = request.cookies.get(ACCESS_COOKIE)?.value;
  const session = token ? await verifyAccessToken(token) : null;

  const { pathname } = request.nextUrl;
  const isDashboardRoute = pathname.startsWith("/dashboard");
  const isLoginRoute = pathname === "/login";

  if (isDashboardRoute && !session) {
    // O token de acesso dura 15 min; quem tem sessão (refresh token válido) é renovado em
    // /api/auth/renovar e volta para esta página. Sem refresh válido, ali mesmo vai ao login.
    return NextResponse.redirect(new URL(caminhoParaRenovar(pathname, request.nextUrl.search), request.url));
  }

  if (isLoginRoute && session) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/dashboard/:path*", "/login"],
};
