import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { resolveLoginIdentifier } from "@/lib/login-identifier";
import {
  verifyPassword,
  hashPassword,
  precisaRehash,
  signAccessToken,
  generateRefreshToken,
  ACCESS_COOKIE,
  REFRESH_COOKIE,
  accessCookieOptions,
  refreshCookieOptions,
} from "@/lib/auth";
import { handleApiError } from "@/lib/http";
import { ehPrimeiroAcesso, enviarBoasVindasApp } from "@/lib/boas-vindas";
import { chaveIp, chaveLogin, mensagemBloqueio, POLITICA_LOGIN_CONTA, POLITICA_LOGIN_IP } from "@/lib/limite-login";
import { contarTentativaSemFalhar, estaBloqueada } from "@/lib/limite-tentativas";
import { ipDaRequisicao } from "@/lib/ip-requisicao";
import { origemPermitida, respostaOrigemNegada } from "@/lib/origem-requisicao";

/** Hash bcrypt (custo 12) de uma senha aleatória descartada: só serve para igualar o tempo de resposta. */
const HASH_FALSO = "$2b$12$FgtWwXqYU/7uCmSlQH3d3OQ8nmrHVPCXZLnVIArIMgRm88TQ/P2Sq";

const loginSchema = z.object({
  identifier: z.string().min(3),
  // bcrypt só usa os 72 primeiros bytes; um teto evita gastar CPU com senhas gigantes.
  password: z.string().min(1).max(128),
});

export async function POST(request: NextRequest) {
  try {
    if (!origemPermitida(request.headers)) return respostaOrigemNegada();
    const body = loginSchema.parse(await request.json());

    const identifier = resolveLoginIdentifier(body.identifier);
    if (!identifier) {
      return NextResponse.json({ error: "Credenciais inválidas" }, { status: 401 });
    }

    // Limite de tentativas. Todos os contadores valem exista a conta ou não
    // (assim a resposta não revela quais logins existem). O limitador nunca derruba o login:
    // se a tabela falhar (ex.: migração pendente), registra o erro e segue liberado.
    const segredo = process.env.JWT_ACCESS_SECRET ?? "";
    const ip = ipDaRequisicao(request.headers);
    const chaveDoIp = ip ? chaveIp("login", ip, segredo) : null;
    const bloqueio = (segundos: number) =>
      NextResponse.json(
        { error: mensagemBloqueio(segundos) },
        { status: 429, headers: { "Retry-After": String(segundos) } },
      );

    // Por IP: quem já errou demais não testa mais nenhuma senha (barra "password spraying").
    if (chaveDoIp) {
      const porIp = await estaBloqueada(chaveDoIp).catch((e: unknown) => {
        console.error("limite-login: leitura do IP falhou", e);
        return { bloqueado: false as const };
      });
      if (porIp.bloqueado) return bloqueio(porIp.segundos);
    }

    // Por conta: a tentativa é contada ANTES de conferir a senha e de forma atômica no banco.
    // Assim uma rajada de requisições paralelas recebe contagens 1, 2, 3... e só as 5 primeiras
    // chegam a testar uma senha (ler e gravar depois deixava todas passarem com "0 falhas").
    const chave = chaveLogin(identifier, segredo);
    const conta = await contarTentativaSemFalhar(chave, POLITICA_LOGIN_CONTA);
    if (conta.bloqueado) return bloqueio(conta.segundos);

    const falhouLogin = async () => {
      if (chaveDoIp) await contarTentativaSemFalhar(chaveDoIp, POLITICA_LOGIN_IP);
      return NextResponse.json({ error: "Credenciais inválidas" }, { status: 401 });
    };

    const user =
      identifier.type === "email"
        ? await prisma.user.findUnique({ where: { email: identifier.value } })
        : await prisma.user.findFirst({ where: { phone: identifier.value } });
    if (!user || !user.active || user.deletedAt) {
      // Gasta o mesmo tempo do bcrypt de uma senha errada, para o tempo de resposta
      // não revelar se a conta existe.
      await verifyPassword(body.password, HASH_FALSO);
      return await falhouLogin();
    }

    const validPassword = await verifyPassword(body.password, user.passwordHash);
    if (!validPassword) {
      return await falhouLogin();
    }

    // Hash antigo com custo de bcrypt menor que o atual: troca por um novo (a senha está em mãos agora).
    if (precisaRehash(user.passwordHash)) {
      await prisma.user
        .update({ where: { id: user.id }, data: { passwordHash: await hashPassword(body.password) } })
        .catch((e: unknown) => console.error("login: rehash da senha falhou", e));
    }

    // Login correto: zera o contador da conta.
    await prisma.loginTentativa
      .deleteMany({ where: { chave } })
      .catch((e: unknown) => console.error("limite-login: limpeza falhou", e));

    const accessToken = await signAccessToken({
      sub: user.id,
      role: user.role,
      schoolId: user.schoolId,
      name: user.name,
    });

    // Antes de criar a sessão: depois dela o responsável já não seria "primeiro acesso".
    const primeiroAcesso = await ehPrimeiroAcesso(user);

    const { token: refreshToken, tokenHash, expiresAt } = generateRefreshToken();
    await prisma.refreshToken.create({
      data: { tokenHash, userId: user.id, expiresAt },
    });

    if (primeiroAcesso) await enviarBoasVindasApp(user);

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
