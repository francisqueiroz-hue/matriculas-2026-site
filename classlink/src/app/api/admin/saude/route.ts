import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { handleApiError } from "@/lib/http";

const JANELA_DIAS = 30;

/** Saúde do sistema para o Painel: erros do servidor e alertas da CSP dos últimos 30 dias. */
export async function GET() {
  try {
    await requireRole("ADMIN");
    const desde = new Date(Date.now() - JANELA_DIAS * 24 * 60 * 60 * 1000);
    const [erros, csp] = await Promise.all([
      prisma.erroServidor.findMany({
        where: { ultimaVez: { gte: desde } },
        orderBy: { ultimaVez: "desc" },
        take: 50,
        select: { id: true, origem: true, mensagem: true, total: true, primeiraVez: true, ultimaVez: true },
      }),
      prisma.cspViolacao.findMany({
        where: { ultimaVez: { gte: desde } },
        orderBy: { ultimaVez: "desc" },
        take: 20,
        select: { id: true, diretiva: true, bloqueado: true, pagina: true, total: true, ultimaVez: true },
      }),
    ]);
    return NextResponse.json({ janelaDias: JANELA_DIAS, erros, csp });
  } catch (error) {
    return handleApiError(error);
  }
}

/** "Marcar como resolvidos": limpa a lista de erros (ou os alertas da CSP com ?tipo=csp). */
export async function DELETE(request: NextRequest) {
  try {
    await requireRole("ADMIN");
    const csp = request.nextUrl.searchParams.get("tipo") === "csp";
    const r = csp ? await prisma.cspViolacao.deleteMany({}) : await prisma.erroServidor.deleteMany({});
    return NextResponse.json({ removidos: r.count });
  } catch (error) {
    return handleApiError(error);
  }
}
