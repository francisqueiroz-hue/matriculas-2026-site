import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { handleApiError } from "@/lib/http";
import { mesReferenciaAtual, agoraNoFusoDaEscola } from "@/lib/billing";
import { statusEfetivo, type StatusBoleto } from "@/lib/baixa-boleto";

/** Painel simples: quantos boletos foram pagos vs. pendentes no mês corrente. */
export async function GET() {
  try {
    const session = await requireRole("ADMIN");
    const hoje = agoraNoFusoDaEscola();
    const mesReferencia = mesReferenciaAtual(hoje);

    const boletos = await prisma.boleto.findMany({
      where: { schoolId: session.schoolId, mesReferencia },
      select: { status: true, valor: true, vencimento: true },
    });

    const resumo = { PENDENTE: 0, PAGO: 0, VENCIDO: 0, ERRO: 0 } as Record<string, number>;
    let valorPago = 0;
    let valorPendente = 0;
    for (const b of boletos) {
      const status = statusEfetivo(b.status as StatusBoleto, b.vencimento, hoje);
      resumo[status] = (resumo[status] ?? 0) + 1;
      if (status === "PAGO") valorPago += Number(b.valor);
      else if (status === "PENDENTE" || status === "VENCIDO") valorPendente += Number(b.valor);
    }

    return NextResponse.json({ mesReferencia, total: boletos.length, resumo, valorPago, valorPendente });
  } catch (error) {
    return handleApiError(error);
  }
}
