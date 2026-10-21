import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/session";
import { verifyPassword, hashPassword } from "@/lib/auth";
import { handleApiError } from "@/lib/http";
import { changePasswordSchema } from "@/lib/validators";
import { encerrarTodasAsSessoes } from "@/lib/renovacao-sessao";

/** Troca de senha pelo próprio usuário. Revoga as demais sessões (refresh tokens) por segurança. */
export async function POST(request: NextRequest) {
  try {
    const session = await requireSession();
    const body = changePasswordSchema.parse(await request.json());

    const user = await prisma.user.findUniqueOrThrow({ where: { id: session.sub } });
    const validPassword = await verifyPassword(body.currentPassword, user.passwordHash);
    if (!validPassword) {
      return NextResponse.json({ error: "Senha atual incorreta" }, { status: 401 });
    }

    await prisma.$transaction([
      prisma.user.update({ where: { id: user.id }, data: { passwordHash: await hashPassword(body.newPassword) } }),
      prisma.refreshToken.updateMany(encerrarTodasAsSessoes(user.id)),
    ]);

    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
}
