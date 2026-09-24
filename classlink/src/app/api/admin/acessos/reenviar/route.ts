import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { handleApiError } from "@/lib/http";
import { hashPassword } from "@/lib/auth";
import { getAccessTemplate, isWhatsAppConfigured, sendAccessViaWhatsApp } from "@/lib/whatsapp";
import { parametrosModeloAcesso } from "@/lib/acesso";

const bodySchema = z.object({ ids: z.array(z.string().min(1)).min(1).max(300) });

/**
 * Reenvia, pelo modelo aprovado na Meta, o acesso de vários responsáveis de uma vez (os
 * que nunca entraram). A senha de cada um só é trocada se o envio foi aceito — quem
 * falhar mantém a senha anterior e aparece na lista de falhas.
 */
export async function POST(request: NextRequest) {
  try {
    const session = await requireRole("ADMIN");
    const { ids } = bodySchema.parse(await request.json());

    if (!isWhatsAppConfigured() || !getAccessTemplate()) {
      return NextResponse.json(
        { error: "Envio automático indisponível: configure o modelo aprovado (WHATSAPP_TEMPLATE_ACESSO)." },
        { status: 400 },
      );
    }

    const responsaveis = await prisma.user.findMany({
      where: { id: { in: ids }, schoolId: session.schoolId, role: "GUARDIAN", deletedAt: null, active: true },
      select: { id: true, name: true, phone: true, email: true },
    });

    const enviados: string[] = [];
    const falhas: { id: string; nome: string; motivo: string }[] = [];

    for (const r of responsaveis) {
      if (!r.phone) {
        falhas.push({ id: r.id, nome: r.name, motivo: "sem telefone cadastrado" });
        continue;
      }
      const senha = randomBytes(6).toString("hex");
      try {
        const enviado = await sendAccessViaWhatsApp(
          r.phone,
          parametrosModeloAcesso({ nome: r.name, url: `${request.nextUrl.origin}/guia`, login: r.email ?? r.phone, senha }),
        );
        if (!enviado) {
          falhas.push({ id: r.id, nome: r.name, motivo: "telefone inválido" });
          continue;
        }
        await prisma.user.update({ where: { id: r.id }, data: { passwordHash: await hashPassword(senha) } });
        enviados.push(r.id);
      } catch (err) {
        falhas.push({ id: r.id, nome: r.name, motivo: err instanceof Error ? err.message : "erro no envio" });
      }
    }

    return NextResponse.json({ enviados: enviados.length, falhas });
  } catch (error) {
    return handleApiError(error);
  }
}
