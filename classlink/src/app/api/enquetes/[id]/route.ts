import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/session";
import { handleApiError } from "@/lib/http";
import { ErroDeUsuario } from "@/lib/erros";
import { enqueteAberta } from "@/lib/enquetes";
import { carregarEnqueteVisivel } from "@/lib/enquetes-acesso";

export async function GET(_request: Request, ctx: RouteContext<"/api/enquetes/[id]">) {
  try {
    const session = await requireSession();
    const { id } = await ctx.params;
    const enquete = await carregarEnqueteVisivel(session, id);
    if (!enquete) throw new ErroDeUsuario("Enquete não encontrada.", 404);

    const base = {
      id: enquete.id,
      titulo: enquete.titulo,
      descricao: enquete.descricao,
      audience: enquete.audience,
      anonima: enquete.anonima,
      prazo: enquete.prazo,
      encerradaEm: enquete.encerradaEm,
      dataCriacao: enquete.dataCriacao,
      class: enquete.class,
      aluno: enquete.aluno,
      aberta: enqueteAberta(enquete),
      perguntas: enquete.perguntas.map((p) => ({ id: p.id, tipo: p.tipo, texto: p.texto, obrigatoria: p.obrigatoria, opcoes: p.opcoes })),
    };

    if (session.role === "GUARDIAN") {
      const participacao = await prisma.enqueteParticipacao.findUnique({
        where: { enqueteId_userId: { enqueteId: id, userId: session.sub } },
        select: { respondidoEm: true },
      });
      return NextResponse.json({ enquete: base, respondidaEm: participacao?.respondidoEm ?? null });
    }

    const totalRespostas = await prisma.enqueteParticipacao.count({ where: { enqueteId: id } });
    return NextResponse.json({ enquete: base, totalRespostas });
  } catch (error) {
    return handleApiError(error);
  }
}
