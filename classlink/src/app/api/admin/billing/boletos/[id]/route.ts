import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { handleApiError } from "@/lib/http";
import { ErroDeUsuario } from "@/lib/erros";
import { agoraNoFusoDaEscola } from "@/lib/billing";
import { correcaoBaixa, dataDePagamento, transicaoBaixa, transicaoCancelamento, valorEmReais } from "@/lib/baixa-boleto";

const valorSchema = z.union([z.number(), z.string().max(20)]);

const motivo = z.string().trim().min(3, "Informe o motivo.").max(300, "Motivo muito longo (máximo 300 caracteres).");

const schema = z.discriminatedUnion("acao", [
  z.object({ acao: z.literal("CANCELAR"), motivo }),
  z.object({ acao: z.literal("REATIVAR"), motivo }),
  z.object({
    acao: z.literal("PAGO"),
    dataPagamento: z.string().optional(),
    valorPago: valorSchema.optional(),
  }),
  z.object({ acao: z.literal("DESFAZER") }),
  z.object({
    acao: z.literal("CORRIGIR"),
    valor: valorSchema.optional(),
    valorPago: valorSchema.optional(),
    dataPagamento: z.string().optional(),
    motivo,
  }),
]);

/**
 * Baixa manual: a escola cobra e recebe fora do sistema, então o admin marca o boleto como
 * pago (com a data e o valor recebido), desfaz a marcação feita por engano ou corrige uma
 * baixa com valor/data errados (com motivo), ou cancela um boleto lançado em duplicidade (com
 * motivo; reativável). Pagamento confirmado pelo banco (boleto
 * emitido no Inter) não é desfeito nem corrigido por aqui. Toda ação fica no histórico.
 */
export async function PATCH(request: NextRequest, ctx: RouteContext<"/api/admin/billing/boletos/[id]">) {
  try {
    const session = await requireRole("ADMIN");
    const { id } = await ctx.params;
    const body = schema.parse(await request.json());

    const boleto = await prisma.boleto.findFirst({
      where: { id, schoolId: session.schoolId },
    });
    if (!boleto) return NextResponse.json({ error: "Boleto não encontrado" }, { status: 404 });
    const hoje = agoraNoFusoDaEscola();
    const valorAtual = Number(boleto.valor);
    const valorPagoAtual = boleto.valorPago === null ? null : Number(boleto.valorPago);

    if (body.acao === "CANCELAR" || body.acao === "REATIVAR") {
      const status = transicaoCancelamento(body.acao, {
        status: boleto.status,
        codigoSolicitacao: boleto.codigoSolicitacao,
      });
      await prisma.$transaction(async (tx) => {
        // Só grava se ninguém mexeu no boleto desde a leitura.
        const { count } = await tx.boleto.updateMany({
          where: { id, status: boleto.status, updatedAt: boleto.updatedAt },
          // Cancelado não conta como recebido; o que havia fica no histórico (campos "Anterior").
          data: { status, pagoEm: null, valorPago: null },
        });
        if (count === 0) throw new ErroDeUsuario("Este boleto foi alterado agora há pouco. Recarregue a tela e confira de novo.", 409);
        await tx.boletoBaixaLog.create({
          data: {
            boletoId: id,
            schoolId: session.schoolId,
            acao: body.acao,
            statusAnterior: boleto.status,
            statusNovo: status,
            dataPagamento: null,
            valor: boleto.valor,
            valorPago: null,
            valorPagoAnterior: boleto.valorPago,
            dataPagamentoAnterior: boleto.pagoEm,
            motivo: body.motivo,
            porUserId: session.sub,
            porNome: session.name,
          },
        });
      });
      return NextResponse.json({ id, status });
    }

    if (body.acao === "CORRIGIR") {
      const mudancas = correcaoBaixa(
        {
          status: boleto.status,
          codigoSolicitacao: boleto.codigoSolicitacao,
          valor: valorAtual,
          valorPago: valorPagoAtual,
          pagoEm: boleto.pagoEm,
        },
        {
          valor: body.valor === undefined ? undefined : valorEmReais(body.valor, "Valor do boleto"),
          valorPago: body.valorPago === undefined ? undefined : valorEmReais(body.valorPago, "Valor recebido"),
          dataPagamento: body.dataPagamento ? dataDePagamento(body.dataPagamento, hoje) : undefined,
        },
      );
      const atualizado = await prisma.$transaction(async (tx) => {
        // Só grava se ninguém mexeu no boleto desde a leitura (duas abas, duas pessoas).
        const { count } = await tx.boleto.updateMany({
          where: { id, status: "PAGO", updatedAt: boleto.updatedAt },
          data: mudancas,
        });
        if (count === 0) throw new ErroDeUsuario("Este boleto foi alterado agora há pouco. Recarregue a tela e confira de novo.", 409);
        const novo = await tx.boleto.findUniqueOrThrow({ where: { id } });
        await tx.boletoBaixaLog.create({
          data: {
            boletoId: id,
            schoolId: session.schoolId,
            acao: "CORRIGIR",
            statusAnterior: boleto.status,
            statusNovo: novo.status,
            dataPagamento: novo.pagoEm,
            valor: novo.valor,
            valorPago: novo.valorPago,
            valorAnterior: boleto.valor,
            valorPagoAnterior: boleto.valorPago,
            dataPagamentoAnterior: boleto.pagoEm,
            motivo: body.motivo,
            porUserId: session.sub,
            porNome: session.name,
          },
        });
        return novo;
      });
      return NextResponse.json({
        id: atualizado.id,
        status: atualizado.status,
        pagoEm: atualizado.pagoEm,
        valor: Number(atualizado.valor),
        valorPago: atualizado.valorPago === null ? null : Number(atualizado.valorPago),
      });
    }

    const data = transicaoBaixa(
      body.acao,
      { status: boleto.status, codigoSolicitacao: boleto.codigoSolicitacao },
      body.acao === "PAGO" ? dataDePagamento(body.dataPagamento, hoje) : new Date(),
    );
    // Na baixa, sem valor informado vale o do boleto; ao desfazer, o recebido é apagado.
    const valorPago =
      body.acao === "PAGO" ? (body.valorPago === undefined ? valorAtual : valorEmReais(body.valorPago, "Valor recebido")) : null;
    // Atualização e registro de auditoria na mesma transação: não há baixa sem rastro.
    const atualizado = await prisma.$transaction(async (tx) => {
      const novo = await tx.boleto.update({
        where: { id },
        data: {
          status: data.status,
          pagoEm: data.pagoEm,
          valorPago,
          erroDetalhe: null,
        },
      });
      await tx.boletoBaixaLog.create({
        data: {
          boletoId: id,
          schoolId: session.schoolId,
          acao: body.acao,
          statusAnterior: boleto.status,
          statusNovo: data.status,
          dataPagamento: data.pagoEm,
          valor: boleto.valor,
          valorPago,
          valorPagoAnterior: boleto.valorPago,
          porUserId: session.sub,
          porNome: session.name,
        },
      });
      return novo;
    });
    return NextResponse.json({
      id: atualizado.id,
      status: atualizado.status,
      pagoEm: atualizado.pagoEm,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
