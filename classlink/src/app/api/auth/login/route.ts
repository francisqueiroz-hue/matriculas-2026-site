import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { resolveLoginIdentifier } from "@/lib/login-identifier";
import {
  verifyPassword,
  signAccessToken,
  generateRefreshToken,
  ACCESS_COOKIE,
  REFRESH_COOKIE,
  accessCookieOptions,
  refreshCookieOptions,
} from "@/lib/auth";
import { handleApiError } from "@/lib/http";
import { chaveLogin, mensagemBloqueio, registrarFalha, situacaoLogin } from "@/lib/limite-login";

const loginSchema = z.object({
  identifier: z.string().min(3),
  password: z.string().min(1),
});

export async function POST(request: NextRequest) {
  try {
    const body = loginSchema.parse(await request.json());

    const identifier = resolveLoginIdentifier(body.identifier);
    if (!identifier) {
      return NextResponse.json({ error: "Credenciais inválidas" }, { status: 401 });
    }

    // Limite de tentativas: conta falhas por identificador, exista a conta ou não
    // (assim a resposta não revela quais logins existem).
    const chave = chaveLogin(identifier, process.env.JWT_ACCESS_SECRET ?? "");
    const agora = new Date();
    const registro = await prisma.loginTentativa.findUnique({ where: { chave } });
    const situacao = situacaoLogin(registro, agora);
    if (situacao.bloqueado) {
      return NextResponse.json(
        { error: mensagemBloqueio(situacao.segundos) },
        { status: 429, headers: { "Retry-After": String(situacao.segundos) } },
      );
    }

    const falhouLogin = async () => {
      const novo = registrarFalha(registro, agora);
      await prisma.loginTentativa.upsert({
        where: { chave },
        create: { chave, ...novo },
        update: novo,
      });
      return NextResponse.json({ error: "Credenciais inválidas" }, { status: 401 });
    };

    const user =
      identifier.type === "email"
        ? await prisma.user.findUnique({ where: { email: identifier.value } })
        : await prisma.user.findFirst({ where: { phone: identifier.value } });
    if (!user || !user.active || user.deletedAt) {
      return await falhouLogin();
    }

    const validPassword = await verifyPassword(body.password, user.passwordHash);
    if (!validPassword) {
      return await falhouLogin();
    }

    if (registro) {
      await prisma.loginTentativa.deleteMany({ where: { chave } });
    }

    const accessToken = await signAccessToken({
      sub: user.id,
      role: user.role,
      schoolId: user.schoolId,
      name: user.name,
    });

    const { token: refreshToken, tokenHash, expiresAt } = generateRefreshToken();
    await prisma.refreshToken.create({
      data: { tokenHash, userId: user.id, expiresAt },
    });

    const response = NextResponse.json({
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        schoolId: user.schoolId,
        avatarUrl: user.avatarUrl,
      },
    });
    response.cookies.set(ACCESS_COOKIE, accessToken, accessCookieOptions);
    response.cookies.set(REFRESH_COOKIE, refreshToken, refreshCookieOptions);
    return response;
  } catch (error) {
    return handleApiError(error);
  }
}
