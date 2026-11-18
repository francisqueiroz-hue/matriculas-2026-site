import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { ehGestaoDaSessao, requireRole } from "@/lib/session";
import { handleApiError } from "@/lib/http";
import { MENSAGEM_RESULTADOS_SO_GESTAO } from "@/lib/enquetes";
import { ErroDeUsuario } from "@/lib/erros";
import { carregarEnqueteVisivel, publicoDaEnquete } from "@/lib/enquetes-acesso";
import { exigirArea } from "@/lib/visibilidade-server";

/** Quem ainda não respondeu. Só existe para enquete identificada: em anônima a lista não é exibida. */
export async function GET(_request: Request, ctx: RouteContext<"/api/enquetes/[id]/pendentes">) {
  try {
    const session = await requireRole("ADMIN", "STAFF");
    await exigirArea(session, "ENQUETES");
    // Resultados, pendências e exportação ficam com a gestão (direção, secretaria e coordenação).
    if (!(await ehGestaoDaSessao(session))) throw new ErroDeUsuario(MENSAGEM_RESULTADOS_SO_GESTAO, 403);
    const { id } = await ctx.params;
    const enquete = await carregarEnqueteVisivel(session, id);
    if (!enquete) throw new ErroDeUsuario("Enquete não encontrada.", 404);
    if (enquete.anonima) throw new ErroDeUsuario("Enquete anônima: a lista de quem falta não é exibida.", 400);

    const [publico, feitas] = await Promise.all([
      publicoDaEnquete(enquete),
      prisma.enqueteParticipacao.findMany({ where: { enqueteId: id }, select: { userId: true } }),
    ]);
    const feitasSet = new Set(feitas.map((f) => f.userId));
    return NextResponse.json({ pendentes: publico.filter((p) => !feitasSet.has(p.id)) });
  } catch (error) {
    return handleApiError(error);
  }
}
