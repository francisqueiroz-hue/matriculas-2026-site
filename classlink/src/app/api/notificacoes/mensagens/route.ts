import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/session";
import { handleApiError } from "@/lib/http";

/**
 * Mensagens não lidas do usuário logado — conversas com famílias (inclusive as que chegam
 * pelo WhatsApp) e, para a equipe, mensagens internas. Consultado periodicamente pelo
 * painel para mostrar o contador no menu, no título da aba e o aviso de mensagem nova.
 */
export async function GET() {
  try {
    const session = await requireSession();
    const naoLida = { senderId: { not: session.sub }, readAt: null };

    const filtroConversa = session.role === "GUARDIAN" ? { guardianId: session.sub } : { staffId: session.sub };
    const [familias, ultimaFamilia] = await Promise.all([
      prisma.message.count({ where: { ...naoLida, conversation: filtroConversa } }),
      prisma.message.findFirst({
        where: { ...naoLida, conversation: filtroConversa },
        orderBy: { createdAt: "desc" },
        select: { id: true, body: true, channel: true, createdAt: true, conversationId: true, sender: { select: { name: true } } },
      }),
    ]);

    let equipe = 0;
    let ultimaEquipe: {
      id: string;
      body: string;
      createdAt: Date;
      conversationId: string;
      sender: { name: string };
    } | null = null;
    if (session.role === "ADMIN" || session.role === "STAFF") {
      const filtroEquipe = { OR: [{ userAId: session.sub }, { userBId: session.sub }] };
      [equipe, ultimaEquipe] = await Promise.all([
        prisma.teamMessage.count({ where: { ...naoLida, conversation: filtroEquipe } }),
        prisma.teamMessage.findFirst({
          where: { ...naoLida, conversation: filtroEquipe },
          orderBy: { createdAt: "desc" },
          select: { id: true, body: true, createdAt: true, conversationId: true, sender: { select: { name: true } } },
        }),
      ]);
    }

    const candidatas = [
      ultimaFamilia && {
        id: ultimaFamilia.id,
        remetente: ultimaFamilia.sender.name,
        texto: ultimaFamilia.body.slice(0, 140),
        viaWhatsApp: ultimaFamilia.channel === "WHATSAPP",
        createdAt: ultimaFamilia.createdAt,
        url: `/dashboard/mensagens/${ultimaFamilia.conversationId}`,
      },
      ultimaEquipe && {
        id: ultimaEquipe.id,
        remetente: ultimaEquipe.sender.name,
        texto: ultimaEquipe.body.slice(0, 140),
        viaWhatsApp: false,
        createdAt: ultimaEquipe.createdAt,
        url: `/dashboard/mensagens/${ultimaEquipe.conversationId}?tipo=equipe`,
      },
    ].filter((m): m is NonNullable<typeof m> => Boolean(m));
    const ultima = candidatas.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0] ?? null;

    return NextResponse.json({ total: familias + equipe, familias, equipe, ultima });
  } catch (error) {
    return handleApiError(error);
  }
}
