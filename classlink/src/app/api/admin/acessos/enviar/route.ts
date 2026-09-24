import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { handleApiError } from "@/lib/http";
import { descreverEnvio, enviarAcessoPeloApp } from "@/lib/envio-acesso";

const bodySchema = z.object({ ids: z.array(z.string().min(1)).min(1).max(300) });

/**
 * Envia o acesso de uma ou várias pessoas (famílias ou equipe) pelo WhatsApp da escola,
 * pelo próprio ClassLink — convite com o botão ACESSO ou, com a conversa aberta, login e
 * senha direto. Cada pessoa recebe o resultado individual.
 */
export async function POST(request: NextRequest) {
  try {
    const session = await requireRole("ADMIN");
    const { ids } = bodySchema.parse(await request.json());

    const pessoas = await prisma.user.findMany({
      where: { id: { in: ids }, schoolId: session.schoolId, deletedAt: null, active: true },
      select: { id: true, name: true },
    });

    const resultados: { id: string; nome: string; enviado: boolean; via?: string; mensagem: string }[] = [];
    for (const p of pessoas) {
      const r = await enviarAcessoPeloApp(p.id, request.nextUrl.origin);
      resultados.push({ id: p.id, nome: p.name, enviado: r.enviado, via: r.enviado ? r.via : undefined, mensagem: descreverEnvio(r) });
    }

    return NextResponse.json({
      enviados: resultados.filter((r) => r.enviado).length,
      falhas: resultados.filter((r) => !r.enviado).map((r) => ({ id: r.id, nome: r.nome, motivo: r.mensagem })),
      resultados,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
