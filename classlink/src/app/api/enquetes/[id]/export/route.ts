import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { handleApiError } from "@/lib/http";
import { ErroDeUsuario } from "@/lib/erros";
import { detalhesLiberados, MINIMO_RESPOSTAS_ANONIMAS } from "@/lib/enquetes";
import { carregarEnqueteVisivel } from "@/lib/enquetes-acesso";

function csv(valor: string) {
  // Evita que o Excel execute fórmula digitada por uma família (=, +, -, @) e escapa aspas/quebras.
  const seguro = /^[=+\-@]/.test(valor) ? `'${valor}` : valor;
  return /[",\n]/.test(seguro) ? `"${seguro.replace(/"/g, '""')}"` : seguro;
}

export async function GET(_request: Request, ctx: RouteContext<"/api/enquetes/[id]/export">) {
  try {
    const session = await requireRole("ADMIN", "STAFF");
    const { id } = await ctx.params;
    const enquete = await carregarEnqueteVisivel(session, id);
    if (!enquete) throw new ErroDeUsuario("Enquete não encontrada.", 404);

    const envios = await prisma.enqueteEnvio.findMany({
      where: { enqueteId: id },
      include: { itens: true, user: { select: { name: true } } },
    });
    if (!detalhesLiberados(enquete.anonima, envios.length)) {
      throw new ErroDeUsuario(`Para proteger o anonimato, a exportação fica disponível a partir de ${MINIMO_RESPOSTAS_ANONIMAS} respostas.`);
    }

    // Anônima: ordem do id aleatório (uuid), sem horário nem nome. Identificada: por horário.
    const ordenados = enquete.anonima
      ? [...envios].sort((a, b) => a.id.localeCompare(b.id))
      : [...envios].sort((a, b) => (a.respondidoEm?.getTime() ?? 0) - (b.respondidoEm?.getTime() ?? 0));

    const cabecalho = [...(enquete.anonima ? [] : ["Responsável", "Data/Hora"]), ...enquete.perguntas.map((p) => p.texto)];
    const linhas = ordenados.map((e) => {
      const porPergunta = new Map(e.itens.map((i) => [i.perguntaId, i.numero !== null ? String(i.numero) : (i.texto ?? "")]));
      return [
        ...(enquete.anonima ? [] : [e.user?.name ?? "", e.respondidoEm ? e.respondidoEm.toLocaleString("pt-BR") : ""]),
        ...enquete.perguntas.map((p) => porPergunta.get(p.id) ?? ""),
      ];
    });

    const corpo = "﻿" + [cabecalho, ...linhas].map((l) => l.map(csv).join(",")).join("\n");
    return new NextResponse(corpo, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="enquete-${id}.csv"`,
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}
