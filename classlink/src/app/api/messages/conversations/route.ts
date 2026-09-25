import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/session";
import { handleApiError } from "@/lib/http";
import { MENSAGEM_BLOQUEIO, ONDE_GESTAO, perfilDoUsuario, podeConversar, perfilMensagens } from "@/lib/permissoes-mensagens";

export async function GET() {
  try {
    const session = await requireSession();
    const perfil = await perfilDoUsuario(session.sub);
    // Professores e auxiliares não conversam com famílias (conversas antigas ficam ocultas).
    if (perfil === "professor") return NextResponse.json({ conversations: [] });

    const conversations = await prisma.conversation.findMany({
      where:
        perfil === "familia"
          ? // A família só vê as conversas com a direção/coordenação.
            { guardianId: session.sub, staff: ONDE_GESTAO }
          : // Famílias excluídas (saíram da escola) não aparecem mais na lista.
            { staffId: session.sub, guardian: { deletedAt: null } },
      include: {
        staff: { select: { id: true, name: true, role: true } },
        guardian: { select: { id: true, name: true } },
        messages: { orderBy: { createdAt: "desc" }, take: 1 },
        _count: {
          select: {
            // Não lidas (recebidas e ainda não abertas) — para família e equipe.
            messages: { where: { senderId: { not: session.sub }, readAt: null } },
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({ conversations, podeExcluir: perfil === "gestao" });
  } catch (error) {
    return handleApiError(error);
  }
}

const startSchema = z.object({ counterpartUserId: z.string().min(1) });

export async function POST(request: NextRequest) {
  try {
    const session = await requireSession();
    const { counterpartUserId } = startSchema.parse(await request.json());

    const counterpart = await prisma.user.findFirst({
      where: { id: counterpartUserId, schoolId: session.schoolId, active: true, deletedAt: null },
      select: { id: true, role: true, isCoordenacao: true, funcao: true },
    });
    if (!counterpart) return NextResponse.json({ error: "Usuário não encontrado" }, { status: 404 });

    const meuPerfil = await perfilDoUsuario(session.sub);
    const perfilOutro = perfilMensagens(counterpart);
    // Conversa família ↔ escola: um lado é a família, o outro a equipe.
    if ((meuPerfil === "familia") === (perfilOutro === "familia")) {
      return NextResponse.json(
        { error: meuPerfil === "familia" ? "Selecione alguém da escola para conversar" : "Selecione um responsável para conversar" },
        { status: 400 },
      );
    }
    if (!podeConversar(meuPerfil, perfilOutro)) {
      return NextResponse.json({ error: MENSAGEM_BLOQUEIO }, { status: 403 });
    }
    const staffId = meuPerfil === "familia" ? counterpart.id : session.sub;
    const guardianId = meuPerfil === "familia" ? session.sub : counterpart.id;

    const conversation = await prisma.conversation.upsert({
      where: { staffId_guardianId: { staffId, guardianId } },
      update: {},
      create: { staffId, guardianId },
      include: {
        staff: { select: { id: true, name: true, role: true } },
        guardian: { select: { id: true, name: true } },
      },
    });

    return NextResponse.json({ conversation }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
