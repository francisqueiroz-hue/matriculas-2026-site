import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/session";
import { handleApiError } from "@/lib/http";

/**
 * Aparelhos da própria pessoa que recebem notificações, com o último aviso aceito e o último
 * erro. Mostrado em Minha conta, para conferir se o celular continua registrado ANTES do teste
 * (o botão de teste registra o aparelho de novo e, por isso, sempre chega).
 */
export async function GET() {
  try {
    const session = await requireSession();
    const aparelhos = await prisma.pushToken.findMany({
      where: { userId: session.sub },
      orderBy: { atualizadoEm: "desc" },
      select: { id: true, aparelho: true, createdAt: true, atualizadoEm: true, ultimoEnvioEm: true, ultimoErro: true },
    });
    return NextResponse.json({ aparelhos });
  } catch (error) {
    return handleApiError(error);
  }
}
