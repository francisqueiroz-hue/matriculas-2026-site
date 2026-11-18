import { NextRequest, NextResponse, after } from "next/server";
import { prisma } from "@/lib/prisma";
import { exigirDirecaoOuCoordenacao, perfilDaSessao, requireRole } from "@/lib/session";
import { handleApiError } from "@/lib/http";
import { MENSAGEM_SO_DIRECAO_COORDENACAO_EQUIPE, podeEscreverParaEquipe } from "@/lib/equipe";
import { notifyUsers } from "@/lib/push";
import { exigirArea } from "@/lib/visibilidade-server";
import { ONDE_EQUIPE_ATIVA, SELECT_AUTOR, autorParaExibir, estaNaoLida, novaMensagemEquipeSchema } from "@/lib/mensagens-equipe";

/** Mensagens para toda a equipe: todos da equipe veem; famílias não acessam. */
export async function GET() {
  try {
    const session = await requireRole("ADMIN", "STAFF");
    await exigirArea(session, "MENSAGENS");
    const perfil = await perfilDaSessao(session);

    const mensagens = await prisma.mensagemEquipe.findMany({
      where: { schoolId: session.schoolId },
      orderBy: { ultimaAtividadeEm: "desc" },
      take: 100,
      select: {
        id: true,
        titulo: true,
        corpo: true,
        createdAt: true,
        ultimaAtividadeEm: true,
        autorId: true,
        autor: { select: SELECT_AUTOR },
        leituras: { where: { userId: session.sub }, select: { lidaEm: true } },
        _count: { select: { respostas: true } },
      },
    });

    return NextResponse.json({
      podeEscrever: podeEscreverParaEquipe(perfil),
      mensagens: mensagens.map((m) => ({
        id: m.id,
        titulo: m.titulo,
        resumo: m.corpo.slice(0, 160),
        createdAt: m.createdAt,
        ultimaAtividadeEm: m.ultimaAtividadeEm,
        autor: autorParaExibir(m.autor),
        respostas: m._count.respostas,
        naoLida: estaNaoLida(m, m.leituras[0]?.lidaEm, session.sub),
      })),
    });
  } catch (error) {
    return handleApiError(error);
  }
}

/** Nova mensagem para toda a equipe: só direção e coordenação. */
export async function POST(request: NextRequest) {
  try {
    const session = await requireRole("ADMIN", "STAFF");
    await exigirArea(session, "MENSAGENS");
    await exigirDirecaoOuCoordenacao(session, MENSAGEM_SO_DIRECAO_COORDENACAO_EQUIPE);
    const { titulo, corpo } = novaMensagemEquipeSchema.parse(await request.json());

    const agora = new Date();
    const mensagem = await prisma.mensagemEquipe.create({
      data: {
        schoolId: session.schoolId,
        autorId: session.sub,
        titulo,
        corpo,
        createdAt: agora,
        ultimaAtividadeEm: agora,
        leituras: { create: { userId: session.sub, lidaEm: agora } },
      },
      select: { id: true, autor: { select: { name: true } } },
    });

    after(async () => {
      const equipe = await prisma.user.findMany({
        where: { ...ONDE_EQUIPE_ATIVA(session.schoolId), id: { not: session.sub } },
        select: { id: true },
      });
      await notifyUsers(
        equipe.map((u) => u.id),
        { title: `Para toda a equipe: ${titulo}`, body: corpo.slice(0, 120), url: `/dashboard/mensagens/geral/${mensagem.id}` },
      ).catch((err) => console.error("push notify failed", err));
    });

    return NextResponse.json({ mensagem: { id: mensagem.id } }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
