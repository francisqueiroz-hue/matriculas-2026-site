import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { handleApiError } from "@/lib/http";
import { ordenarDupla } from "@/lib/messaging";
import { MENSAGEM_BLOQUEIO, ONDE_GESTAO, perfilDoUsuario, perfilMensagens, podeConversar } from "@/lib/permissoes-mensagens";

export async function GET() {
  try {
    const session = await requireRole("ADMIN", "STAFF");
    const perfil = await perfilDoUsuario(session.sub);

    const conversations = await prisma.teamConversation.findMany({
      where:
        // Colegas excluídos (saíram da escola) não aparecem mais na lista.
        perfil === "gestao"
          ? {
              OR: [
                { userAId: session.sub, userB: { deletedAt: null } },
                { userBId: session.sub, userA: { deletedAt: null } },
              ],
            }
          : // Professores/auxiliares: só as conversas com a direção/coordenação.
            {
              OR: [
                { userAId: session.sub, userB: { ...ONDE_GESTAO, deletedAt: null } },
                { userBId: session.sub, userA: { ...ONDE_GESTAO, deletedAt: null } },
              ],
            },
      include: {
        userA: { select: { id: true, name: true, role: true } },
        userB: { select: { id: true, name: true, role: true } },
        messages: { orderBy: { createdAt: "desc" }, take: 1 },
        _count: { select: { messages: { where: { senderId: { not: session.sub }, readAt: null } } } },
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
    const session = await requireRole("ADMIN", "STAFF");
    const { counterpartUserId } = startSchema.parse(await request.json());

    if (counterpartUserId === session.sub) {
      return NextResponse.json({ error: "Você não pode iniciar uma conversa consigo mesmo" }, { status: 400 });
    }

    const counterpart = await prisma.user.findFirst({
      where: { id: counterpartUserId, schoolId: session.schoolId, active: true, deletedAt: null, role: { in: ["ADMIN", "STAFF"] } },
      select: { id: true, role: true, isCoordenacao: true, funcao: true },
    });
    if (!counterpart) return NextResponse.json({ error: "Usuário não encontrado" }, { status: 404 });
    if (!podeConversar(await perfilDoUsuario(session.sub), perfilMensagens(counterpart))) {
      return NextResponse.json({ error: MENSAGEM_BLOQUEIO }, { status: 403 });
    }

    const [userAId, userBId] = ordenarDupla(session.sub, counterpartUserId);

    const conversation = await prisma.teamConversation.upsert({
      where: { userAId_userBId: { userAId, userBId } },
      update: {},
      create: { userAId, userBId, schoolId: session.schoolId },
      include: {
        userA: { select: { id: true, name: true, role: true } },
        userB: { select: { id: true, name: true, role: true } },
      },
    });

    return NextResponse.json({ conversation }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
