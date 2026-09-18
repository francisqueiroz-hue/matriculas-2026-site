import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/session";
import { handleApiError } from "@/lib/http";
import { updateEmailSchema } from "@/lib/validators";

/**
 * Adiciona/atualiza o e-mail do próprio usuário. Existe porque famílias sem e-mail
 * são cadastradas só com telefone (login por telefone) — este é o jeito delas
 * adicionarem um e-mail depois, sem depender da secretaria.
 */
export async function POST(request: NextRequest) {
  try {
    const session = await requireSession();
    const body = updateEmailSchema.parse(await request.json());
    const email = body.email.toLowerCase();

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing && existing.id !== session.sub) {
      return NextResponse.json({ error: "Esse e-mail já está em uso por outra conta" }, { status: 409 });
    }

    const user = await prisma.user.update({ where: { id: session.sub }, data: { email } });
    return NextResponse.json({ user: { id: user.id, email: user.email } });
  } catch (error) {
    return handleApiError(error);
  }
}
