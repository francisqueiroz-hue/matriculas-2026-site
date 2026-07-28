import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { handleApiError } from "@/lib/http";
import { mesReferenciaAtual } from "@/lib/billing";

/** Painel simples: quantos boletos foram pagos vs. pendentes no mês corrente. */
export async function GET() {
  try {
    const session = await requireRole("ADMIN");
    const mesReferencia = mesReferenciaAtual();

    const boletos = await prisma.boleto.findMany({
      where: { schoolId: session.schoolId, mesReferencia },
      select: { status: true, valor: true },
    });

    const resumo = { PENDENTE: 0, PAGO: 0, VENCIDO: 0, ERRO: 0 } as Record<string, number>;
    let valorPago = 0;
    let valorPendente = 0;
    for (const b of boletos) {
      resumo[b.status] = (resumo[b.status] ?? 0) + 1;
      if (b.status === "PAGO") valorPago += Number(b.valor);
      else if (b.status === "PENDENTE" || b.status === "VENCIDO") valorPendente += Number(b.valor);
    }

    return NextResponse.json({ mesReferencia, total: boletos.length, resumo, valorPago, valorPendente });
  } catch (error) {
    return handleApiError(error);
  }
}
