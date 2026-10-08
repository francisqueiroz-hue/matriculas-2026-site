import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { handleApiError } from "@/lib/http";
import { acaoContratoSchema } from "@/lib/validators";
import { ContratoErro, podeExcluirContrato, proximoStatus } from "@/lib/contratos";
import { responsaveisDoAluno } from "@/lib/contratos-server";
import { getClientIp } from "@/lib/solicitacoes-matricula";
import { notifyUsers } from "@/lib/push";

const EVENTO_POR_ACAO = { APROVAR: "CONFERIDO", DEVOLVER: "DEVOLVIDO", ORIGINAL_RECEBIDO: "ORIGINAL_RECEBIDO" } as const;

/** Secretaria/direção confere o envio: aprova, devolve com motivo ou registra o recebimento da via original. */
export async function PATCH(request: NextRequest, ctx: RouteContext<"/api/admin/contratos/[id]">) {
  try {
    const session = await requireRole("ADMIN");
    const { id } = await ctx.params;
    const body = acaoContratoSchema.parse(await request.json());

    const contrato = await prisma.contrato.findFirst({
      where: { id, schoolId: session.schoolId, student: { deletedAt: null } },
      include: { student: { select: { name: true } } },
    });
    if (!contrato) return NextResponse.json({ error: "Contrato não encontrado" }, { status: 404 });

    let novoStatus;
    try {
      novoStatus = proximoStatus(contrato.status, body.acao, contrato.metodoAssinatura);
    } catch (e) {
      if (e instanceof ContratoErro) return NextResponse.json({ error: e.message }, { status: 409 });
      throw e;
    }

    const motivo = body.acao === "DEVOLVER" ? body.motivo : null;
    const ipOrigem = getClientIp(request);

    const atualizado = await prisma.$transaction(async (tx) => {
      // Atualiza só se o status ainda for o lido acima — evita que duas pessoas da
      // secretaria apliquem ações conflitantes ao mesmo tempo.
      const { count } = await tx.contrato.updateMany({
        where: { id, status: contrato.status },
        data: { status: novoStatus, ...(body.acao === "DEVOLVER" ? { motivoDevolucao: motivo } : {}) },
      });
      if (count === 0) throw new ContratoErro("O contrato foi alterado por outra pessoa. Atualize a página e tente de novo.");
      await tx.contratoEvento.create({
        data: { contratoId: id, tipo: EVENTO_POR_ACAO[body.acao], usuarioId: session.sub, ipOrigem, detalhe: motivo },
      });
      return tx.contrato.findUniqueOrThrow({ where: { id }, select: { id: true, status: true, motivoDevolucao: true } });
    });

    const primeiroNome = contrato.student.name.split(" ")[0];
    const aviso =
      body.acao === "DEVOLVER"
        ? { title: "Contrato devolvido para correção", body: `A secretaria pediu um ajuste no contrato de ${primeiroNome}: ${motivo}` }
        : novoStatus === "COMPLETO"
          ? { title: "Contrato concluído", body: `O contrato de ${primeiroNome} foi conferido e está completo. Obrigado!` }
          : { title: "Falta a via original", body: `Recebemos o contrato de ${primeiroNome}. Entregue a via original assinada na secretaria.` };
    await notifyUsers(await responsaveisDoAluno(contrato.studentId), { ...aviso, url: "/dashboard/contratos" }).catch((err) =>
      console.error("push notify failed", err),
    );

    return NextResponse.json({ contrato: atualizado });
  } catch (error) {
    if (error instanceof ContratoErro) return NextResponse.json({ error: error.message }, { status: 409 });
    return handleApiError(error);
  }
}

/** Exclui um contrato enviado por engano — só enquanto a família ainda não enviou nada. */
export async function DELETE(_request: NextRequest, ctx: RouteContext<"/api/admin/contratos/[id]">) {
  try {
    const session = await requireRole("ADMIN");
    const { id } = await ctx.params;

    const contrato = await prisma.contrato.findFirst({
      where: { id, schoolId: session.schoolId },
      select: { id: true, status: true, _count: { select: { arquivos: { where: { tipo: "ASSINADO" } } } } },
    });
    if (!contrato) return NextResponse.json({ error: "Contrato não encontrado" }, { status: 404 });
    if (!podeExcluirContrato(contrato.status, contrato._count.arquivos)) {
      return NextResponse.json(
        { error: "Este contrato já recebeu envio da família e não pode ser excluído (o histórico é prova)." },
        { status: 409 },
      );
    }

    await prisma.contrato.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
}
