import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/session";
import { handleApiError } from "@/lib/http";
import { descreverAparelho } from "@/lib/device";

const registerSchema = z.object({ token: z.string().min(1) });

export async function POST(request: NextRequest) {
  try {
    const session = await requireSession();
    const { token } = registerSchema.parse(await request.json());

    // Registrado a cada abertura do app: atualizadoEm mostra no diagnóstico (Minha conta)
    // se o aparelho continua ativo, e "aparelho" diz qual é (iPhone, Mac · Chrome...).
    const aparelho = descreverAparelho(request.headers.get("user-agent"));
    const agora = new Date();
    await prisma.pushToken.upsert({
      where: { token },
      update: { userId: session.sub, aparelho, atualizadoEm: agora },
      create: { token, userId: session.sub, aparelho, atualizadoEm: agora },
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
}
