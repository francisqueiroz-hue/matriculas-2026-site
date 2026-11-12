import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { handleApiError } from "@/lib/http";
import { cabecalhosDownloadCsv, celulaCsv } from "@/lib/csv";

const RESPOSTA_LABEL: Record<string, string> = {
  AUTORIZADO: "Autorizado",
  NAO_AUTORIZADO: "Não autorizado",
  CONFIRMADO: "Confirmado",
  NAO_COMPARECERA: "Não comparecerá",
  LIDO: "Lido",
  PENDENTE_EXPIRADO: "Pendente (prazo expirado)",
};

export async function GET(_request: Request, ctx: RouteContext<"/api/comunicados/[id]/export">) {
  try {
    const session = await requireRole("ADMIN", "STAFF");
    const { id: comunicadoId } = await ctx.params;

    const comunicado = await prisma.comunicado.findFirst({ where: { id: comunicadoId, schoolId: session.schoolId } });
    if (!comunicado) return NextResponse.json({ error: "Comunicado não encontrado" }, { status: 404 });

    const respostas = await prisma.respostaComunicado.findMany({
      where: { comunicadoId },
      include: {
        aluno: { select: { name: true } },
        responsavel: { select: { name: true, email: true } },
      },
      orderBy: { dataHoraResposta: "asc" },
    });

    const linhas = [
      ["Aluno", "Responsável", "E-mail", "Resposta", "Data/Hora"].join(","),
      ...respostas.map((r) =>
        [
          celulaCsv(r.aluno.name),
          celulaCsv(r.responsavel.name),
          celulaCsv(r.responsavel.email ?? ""),
          celulaCsv(RESPOSTA_LABEL[r.resposta] ?? r.resposta),
          celulaCsv(r.dataHoraResposta.toLocaleString("pt-BR")),
        ].join(","),
      ),
    ];

    const csv = "﻿" + linhas.join("\n"); // BOM para acentuação correta no Excel

    return new NextResponse(csv, {
      headers: cabecalhosDownloadCsv(`comunicado-${comunicadoId}.csv`),
    });
  } catch (error) {
    return handleApiError(error);
  }
}
