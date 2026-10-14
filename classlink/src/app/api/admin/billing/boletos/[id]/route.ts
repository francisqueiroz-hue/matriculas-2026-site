import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { handleApiError } from "@/lib/http";
import { agoraNoFusoDaEscola } from "@/lib/billing";
import { dataDePagamento, transicaoBaixa } from "@/lib/baixa-boleto";

const schema = z.object({
  acao: z.enum(["PAGO", "DESFAZER"]),
  dataPagamento: z.string().optional(),
});

/**
 * Baixa manual: a escola cobra e recebe fora do sistema, então o admin marca o boleto como
 * pago (com a data) ou desfaz a marcação feita por engano. Pagamento confirmado pelo banco
 * (boleto emitido no Inter) não é desfeito por aqui.
 */
export async function PATCH(request: NextRequest, ctx: RouteContext<"/api/admin/billing/boletos/[id]">) {
  try {
    const session = await requireRole("ADMIN");
    const { id } = await ctx.params;
    const body = schema.parse(await request.json());

    const boleto = await prisma.boleto.findFirst({ where: { id, schoolId: session.schoolId } });
    if (!boleto) return NextResponse.json({ error: "Boleto não encontrado" }, { status: 404 });

    const data = transicaoBaixa(
      body.acao,
      { status: boleto.status, codigoSolicitacao: boleto.codigoSolicitacao },
      body.acao === "PAGO" ? dataDePagamento(body.dataPagamento, agoraNoFusoDaEscola()) : new Date(),
    );
    const atualizado = await prisma.boleto.update({ where: { id }, data: { status: data.status, pagoEm: data.pagoEm, erroDetalhe: null } });
    return NextResponse.json({ id: atualizado.id, status: atualizado.status, pagoEm: atualizado.pagoEm });
  } catch (error) {
    return handleApiError(error);
  }
}
