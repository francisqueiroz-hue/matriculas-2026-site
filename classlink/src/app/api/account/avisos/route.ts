import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { handleApiError } from "@/lib/http";
import { normalizePhoneBR } from "@/lib/whatsapp";
import { avisosWhatsAppDisponiveis } from "@/lib/avisos-equipe";

const atualizarSchema = z.object({
  avisosWhatsApp: z.boolean(),
  telefone: z.string().trim().max(30).optional(),
});

/** Preferência da equipe: receber no WhatsApp o aviso de mensagem nova no ClassLink. */
export async function GET() {
  try {
    const session = await requireRole("ADMIN", "STAFF");
    const user = await prisma.user.findUniqueOrThrow({
      where: { id: session.sub },
      select: { phone: true, avisosWhatsApp: true },
    });
    return NextResponse.json({ ...user, disponivel: await avisosWhatsAppDisponiveis() });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const session = await requireRole("ADMIN", "STAFF");
    const body = atualizarSchema.parse(await request.json());

    const atual = await prisma.user.findUniqueOrThrow({ where: { id: session.sub }, select: { phone: true } });
    let phone = atual.phone;
    if (body.telefone !== undefined && body.telefone !== "") {
      const normalizado = normalizePhoneBR(body.telefone);
      if (!normalizado) return NextResponse.json({ error: "Celular inválido. Use o DDD, ex.: (21) 98765-4321." }, { status: 400 });
      phone = normalizado;
    }
    if (body.avisosWhatsApp && !(phone && normalizePhoneBR(phone))) {
      return NextResponse.json({ error: "Informe seu celular para receber os avisos no WhatsApp." }, { status: 400 });
    }

    const user = await prisma.user.update({
      where: { id: session.sub },
      data: { phone, avisosWhatsApp: body.avisosWhatsApp },
      select: { phone: true, avisosWhatsApp: true },
    });
    return NextResponse.json({ ...user, disponivel: await avisosWhatsAppDisponiveis() });
  } catch (error) {
    return handleApiError(error);
  }
}
