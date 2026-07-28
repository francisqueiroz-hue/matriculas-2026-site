import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { handleApiError } from "@/lib/http";
import { getPublicoAlvo } from "@/lib/comunicados";

const PERIODOS_VALIDOS = [7, 30, 90];

/** Tempo médio de resposta aos comunicados no período selecionado, com contagem de pendentes. */
export async function GET(request: NextRequest) {
  try {
    const session = await requireRole("ADMIN");
    const diasParam = Number(request.nextUrl.searchParams.get("dias") ?? "30");
    const dias = PERIODOS_VALIDOS.includes(diasParam) ? diasParam : 30;
    const desde = new Date(Date.now() - dias * 24 * 60 * 60 * 1000);

    const comunicados = await prisma.comunicado.findMany({
      where: { schoolId: session.schoolId, dataCriacao: { gte: desde } },
      select: {
        id: true,
        titulo: true,
        dataCriacao: true,
        respostas: { select: { resposta: true, dataHoraResposta: true } },
      },
      orderBy: { dataCriacao: "desc" },
    });

    let somaMinutosResposta = 0;
    let totalRespostasContadas = 0;
    let totalPendentes = 0;
    let totalPublicoAlvo = 0;

    for (const c of comunicados) {
      const publicoAlvo = await getPublicoAlvo(c.id);
      totalPublicoAlvo += publicoAlvo.length;
      const respondidas = c.respostas.filter((r) => r.resposta !== "PENDENTE_EXPIRADO");
      totalPendentes += Math.max(publicoAlvo.length - respondidas.length, 0);
      for (const r of respondidas) {
        somaMinutosResposta += (r.dataHoraResposta.getTime() - c.dataCriacao.getTime()) / 60000;
        totalRespostasContadas += 1;
      }
    }

    return NextResponse.json({
      periodoDias: dias,
      desde,
      totalComunicados: comunicados.length,
      totalRespostas: totalRespostasContadas,
      totalPendentes,
      totalPublicoAlvo,
      tempoMedioMinutos: totalRespostasContadas > 0 ? Math.round(somaMinutosResposta / totalRespostasContadas) : null,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
