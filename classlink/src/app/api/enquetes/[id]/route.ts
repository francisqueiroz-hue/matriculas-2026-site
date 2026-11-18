import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { ehGestaoDaSessao, requireSession } from "@/lib/session";
import { handleApiError } from "@/lib/http";
import { ErroDeUsuario } from "@/lib/erros";
import { enqueteAberta } from "@/lib/enquetes";
import { carregarEnqueteVisivel, respondeEstaEnquete } from "@/lib/enquetes-acesso";
import { exigirArea } from "@/lib/visibilidade-server";

export async function GET(_request: Request, ctx: RouteContext<"/api/enquetes/[id]">) {
  try {
    const session = await requireSession();
    await exigirArea(session, "ENQUETES");
    const { id } = await ctx.params;
    const enquete = await carregarEnqueteVisivel(session, id);
    if (!enquete) throw new ErroDeUsuario("Enquete não encontrada.", 404);

    const base = {
      id: enquete.id,
      titulo: enquete.titulo,
      descricao: enquete.descricao,
      audience: enquete.audience,
      interna: enquete.interna,
      anonima: enquete.anonima,
      prazo: enquete.prazo,
      encerradaEm: enquete.encerradaEm,
      dataCriacao: enquete.dataCriacao,
      class: enquete.class,
      aluno: enquete.aluno,
      aberta: enqueteAberta(enquete),
      perguntas: enquete.perguntas.map((p) => ({ id: p.id, tipo: p.tipo, texto: p.texto, obrigatoria: p.obrigatoria, opcoes: p.opcoes })),
    };

    // Quem responde recebe se já respondeu; a gestão recebe o total. Secretaria e coordenação
    // respondem as internas e também acompanham os resultados.
    const podeResponder = await respondeEstaEnquete(session, enquete);
    const participacao = podeResponder
      ? await prisma.enqueteParticipacao.findUnique({
          where: { enqueteId_userId: { enqueteId: id, userId: session.sub } },
          select: { respondidoEm: true },
        })
      : null;
    const gestao = session.role !== "GUARDIAN" && (await ehGestaoDaSessao(session));
    const totalRespostas = gestao ? await prisma.enqueteParticipacao.count({ where: { enqueteId: id } }) : undefined;
    return NextResponse.json({
      enquete: base,
      podeResponder,
      ...(podeResponder ? { respondidaEm: participacao?.respondidoEm ?? null } : {}),
      ...(gestao ? { totalRespostas, gestao: true } : {}),
    });
  } catch (error) {
    return handleApiError(error);
  }
}
