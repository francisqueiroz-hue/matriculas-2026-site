import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/session";
import { verifyPassword, ACCESS_COOKIE, REFRESH_COOKIE } from "@/lib/auth";
import { handleApiError } from "@/lib/http";

const deleteSchema = z.object({ password: z.string().min(1) });

/**
 * Exclusão de conta (direito à eliminação — LGPD art. 18, VI).
 * Anonimiza dados de identificação em vez de excluir a linha, preservando
 * a integridade referencial de posts/mensagens já enviados, e revoga
 * todas as sessões e vínculos com alunos.
 */
export async function POST(request: NextRequest) {
  try {
    const session = await requireSession();
    const body = deleteSchema.parse(await request.json());

    const user = await prisma.user.findUniqueOrThrow({ where: { id: session.sub } });
    const validPassword = await verifyPassword(body.password, user.passwordHash);
    if (!validPassword) {
      return NextResponse.json({ error: "Senha incorreta" }, { status: 401 });
    }

    await prisma.$transaction([
      prisma.user.update({
        where: { id: user.id },
        data: {
          email: `deleted-${randomUUID()}@classlink.invalid`,
          name: "Usuário removido",
          phone: null,
          avatarUrl: null,
          passwordHash: randomUUID(),
          active: false,
          deletedAt: new Date(),
        },
      }),
      prisma.guardianStudent.deleteMany({ where: { guardianId: user.id } }),
      prisma.pushToken.deleteMany({ where: { userId: user.id } }),
      prisma.refreshToken.updateMany({
        where: { userId: user.id, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
    ]);

    const response = NextResponse.json({ ok: true });
    response.cookies.delete(ACCESS_COOKIE);
    response.cookies.delete(REFRESH_COOKIE);
    return response;
  } catch (error) {
    return handleApiError(error);
  }
}
