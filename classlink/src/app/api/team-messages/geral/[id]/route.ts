import { NextRequest, NextResponse, after } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { handleApiError } from "@/lib/http";
import { exigirPodeExcluirConversa } from "@/lib/permissoes-mensagens";
import { notifyUsers } from "@/lib/push";
import { exigirArea } from "@/lib/visibilidade-server";
import { SELECT_AUTOR, autorParaExibir, carregarMensagemEquipe, respostaMensagemEquipeSchema } from "@/lib/mensagens-equipe";

/** Abre o assunto com todas as respostas (todos da equipe veem) e marca como lido para quem abriu. */
export async function GET(_request: NextRequest, ctx: RouteContext<"/api/team-messages/geral/[id]">) {
  try {
    const session = await requireRole("ADMIN", "STAFF");
    await exigirArea(session, "MENSAGENS");
    const { id } = await ctx.params;
    await carregarMensagemEquipe(id, session.schoolId);

    const mensagem = await prisma.mensagemEquipe.findUniqueOrThrow({
      where: { id },
      select: {
        id: true,
        titulo: true,
        corpo: true,
        createdAt: true,
        autor: { select: SELECT_AUTOR },
        respostas: { orderBy: { createdAt: "asc" }, select: { id: true, corpo: true, createdAt: true, autor: { select: SELECT_AUTOR } } },
      },
    });

    const agora = new Date();
    await prisma.mensagemEquipeLeitura.upsert({
      where: { mensagemId_userId: { mensagemId: id, userId: session.sub } },
      update: { lidaEm: agora },
      create: { mensagemId: id, userId: session.sub, lidaEm: agora },
    });

    return NextResponse.json({
      mensagem: {
        id: mensagem.id,
        titulo: mensagem.titulo,
        corpo: mensagem.corpo,
        createdAt: mensagem.createdAt,
        autor: autorParaExibir(mensagem.autor),
        respostas: mensagem.respostas.map((r) => ({ id: r.id, corpo: r.corpo, createdAt: r.createdAt, autor: autorParaExibir(r.autor) })),
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}

/** Responder: qualquer pessoa da equipe. Avisa quem escreveu e quem já respondeu no assunto. */
export async function POST(request: NextRequest, ctx: RouteContext<"/api/team-messages/geral/[id]">) {
  try {
    const session = await requireRole("ADMIN", "STAFF");
    await exigirArea(session, "MENSAGENS");
    const { id } = await ctx.params;
    const mensagem = await carregarMensagemEquipe(id, session.schoolId);
    const { corpo } = respostaMensagemEquipeSchema.parse(await request.json());

    const agora = new Date();
    const [resposta] = await prisma.$transaction([
      prisma.mensagemEquipeResposta.create({
        data: { mensagemId: id, autorId: session.sub, corpo, createdAt: agora },
        select: { id: true, corpo: true, createdAt: true, autor: { select: SELECT_AUTOR } },
      }),
      prisma.mensagemEquipe.update({ where: { id }, data: { ultimaAtividadeEm: agora } }),
      prisma.mensagemEquipeLeitura.upsert({
        where: { mensagemId_userId: { mensagemId: id, userId: session.sub } },
        update: { lidaEm: agora },
        create: { mensagemId: id, userId: session.sub, lidaEm: agora },
      }),
    ]);

    after(async () => {
      const anteriores = await prisma.mensagemEquipeResposta.findMany({
        where: { mensagemId: id, autor: { active: true, deletedAt: null } },
        select: { autorId: true },
        distinct: ["autorId"],
      });
      const destinatarios = [...new Set([mensagem.autorId, ...anteriores.map((r) => r.autorId)])].filter((u) => u !== session.sub);
      await notifyUsers(destinatarios, {
        title: `${resposta.autor.name} respondeu: ${mensagem.titulo}`,
        body: corpo.slice(0, 120),
        url: `/dashboard/mensagens/geral/${id}`,
      }).catch((err) => console.error("push notify failed", err));
    });

    return NextResponse.json({ resposta: { id: resposta.id, corpo: resposta.corpo, createdAt: resposta.createdAt, autor: autorParaExibir(resposta.autor) } }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}

/** Excluir o assunto com as respostas: só direção e coordenação (mesma regra das conversas). */
export async function DELETE(_request: NextRequest, ctx: RouteContext<"/api/team-messages/geral/[id]">) {
  try {
    const session = await requireRole("ADMIN", "STAFF");
    await exigirArea(session, "MENSAGENS");
    const { id } = await ctx.params;
    await carregarMensagemEquipe(id, session.schoolId);
    await exigirPodeExcluirConversa(session.sub);
    await prisma.mensagemEquipe.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
}
