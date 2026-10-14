import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { handleApiError } from "@/lib/http";
import { ErroDeUsuario } from "@/lib/erros";
import { agregarResultados, detalhesLiberados, MINIMO_RESPOSTAS_ANONIMAS } from "@/lib/enquetes";
import { carregarEnqueteVisivel, publicoDaEnquete } from "@/lib/enquetes-acesso";

export async function GET(_request: Request, ctx: RouteContext<"/api/enquetes/[id]/resultados">) {
  try {
    const session = await requireRole("ADMIN", "STAFF");
    const { id } = await ctx.params;
    const enquete = await carregarEnqueteVisivel(session, id);
    if (!enquete) throw new ErroDeUsuario("Enquete não encontrada.", 404);

    const [publico, totalRespostas] = await Promise.all([
      publicoDaEnquete(enquete),
      prisma.enqueteParticipacao.count({ where: { enqueteId: id } }),
    ]);

    const resumo = { totalRespostas, totalPublico: publico.length, anonima: enquete.anonima };
    if (!detalhesLiberados(enquete.anonima, totalRespostas)) {
      return NextResponse.json({
        ...resumo,
        detalhesLiberados: false,
        aviso: `Para proteger o anonimato, os resultados aparecem a partir de ${MINIMO_RESPOSTAS_ANONIMAS} respostas.`,
        resultados: [],
      });
    }

    const itens = await prisma.enqueteItem.findMany({
      where: { envio: { enqueteId: id } },
      select: { perguntaId: true, numero: true, texto: true },
    });
    return NextResponse.json({ ...resumo, detalhesLiberados: true, resultados: agregarResultados(enquete.perguntas, itens) });
  } catch (error) {
    return handleApiError(error);
  }
}
