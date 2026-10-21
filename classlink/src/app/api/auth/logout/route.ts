import { NextRequest, NextResponse, after } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  ACCESS_COOKIE,
  REFRESH_COOKIE,
  accessCookieOptions,
  hashRefreshToken,
  refreshCookieOptions,
  verifyAccessToken,
} from "@/lib/auth";
import { registrarErroServidor } from "@/lib/erros-servidor";
import { TAMANHO_MAXIMO_CORPO_LOGOUT, lerTokenPushDoLogout } from "@/lib/logout-corpo";
import { JANELA_REUSO_MS } from "@/lib/renovacao-sessao";

/** Folga para a diferença de relógio entre o app (revokedAt) e o banco (createdAt = now()). */
const FOLGA_RELOGIO_MS = 5_000;

/**
 * Sai da conta. Os cookies são SEMPRE apagados na resposta, mesmo que o banco falhe: sem
 * isso, uma falha momentânea do banco deixava a pessoa logada no aparelho.
 */
export async function POST(request: NextRequest) {
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

  let sessaoEncerrada = true;
  if (tokenHash) {
    try {
      await encerrarSessao(tokenHash);
    } catch (error) {
      // O aparelho sai mesmo assim (cookies apagados abaixo); o token fica até vencer.
      sessaoEncerrada = false;
      console.error("[logout] falha ao revogar a sessão no banco", error);
      try {
        after(() => registrarErroServidor(error, "logout"));
      } catch {
        void registrarErroServidor(error, "logout");
      }
    }
  }

  const response = NextResponse.json({ ok: true, sessaoEncerrada });
  response.headers.set("Cache-Control", "no-store");
  // Apaga com os mesmos atributos da criação: o refresh vive em path "/api/auth", e um
  // delete com o path padrão ("/") deixaria o cookie real no navegador.
  response.cookies.set(ACCESS_COOKIE, "", { ...accessCookieOptions, maxAge: 0 });
  response.cookies.set(REFRESH_COOKIE, "", { ...refreshCookieOptions, maxAge: 0 });
  return response;
}

async function encerrarSessao(tokenHash: string) {
  const agora = new Date();
  const atual = await prisma.refreshToken.findUnique({
    where: { tokenHash },
    select: { userId: true, revokedAt: true },
  });

  await prisma.refreshToken.updateMany({
    where: { tokenHash, revokedAt: null },
    data: { revokedAt: agora },
  });
  // Logout explícito: o token morre na hora. Só revogar deixaria a janela de reuso de 15 s
  // (situacaoRefresh, "reuso_recente") renovar a sessão logo depois de sair. Vencer o
  // token faz situacaoRefresh devolver "invalido". Sem exigir revokedAt null: cobre também
  // um token já rotacionado há poucos segundos, que ainda estaria dentro da janela.
  await prisma.refreshToken.updateMany({
    where: { tokenHash, expiresAt: { gt: agora } },
    data: { expiresAt: agora },
  });

  // Renovação e logout ao mesmo tempo: se o token deste aparelho já tinha sido trocado,
  // o substituto pode estar a caminho do navegador e reabriria a sessão. Vence também os
  // tokens do mesmo usuário emitidos naquela troca (criados logo depois de revokedAt, dentro
  // da janela de reuso). No pior caso, outro aparelho que renovou no mesmo instante pede login.
  if (atual?.revokedAt) {
    const inicio = new Date(atual.revokedAt.getTime() - FOLGA_RELOGIO_MS);
    const fim = new Date(atual.revokedAt.getTime() + JANELA_REUSO_MS + FOLGA_RELOGIO_MS);
    await prisma.refreshToken.updateMany({
      where: { userId: atual.userId, createdAt: { gte: inicio, lte: fim }, expiresAt: { gt: agora } },
      data: { revokedAt: agora, expiresAt: agora },
    });
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
