import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { handleApiError } from "@/lib/http";
import { atualizarSolicitacaoSchema } from "@/lib/solicitacoes-matricula";

/** Atualiza o status do atendimento e/ou as anotações internas de uma solicitação. */
export async function PATCH(request: NextRequest, ctx: RouteContext<"/api/admin/matriculas/[id]">) {
  try {
    const session = await requireRole("ADMIN");
    const { id } = await ctx.params;
    const body = atualizarSolicitacaoSchema.parse(await request.json());

    const existente = await prisma.solicitacaoMatricula.findFirst({ where: { id, schoolId: session.schoolId } });
    if (!existente) return NextResponse.json({ error: "Solicitação não encontrada" }, { status: 404 });

    const solicitacao = await prisma.solicitacaoMatricula.update({ where: { id }, data: body });
    return NextResponse.json({ solicitacao });
  } catch (error) {
    return handleApiError(error);
  }
}

/** Exclui definitivamente a solicitação (ex.: pedido de exclusão de dados pela família — LGPD). */
export async function DELETE(_request: NextRequest, ctx: RouteContext<"/api/admin/matriculas/[id]">) {
  try {
    const session = await requireRole("ADMIN");
    const { id } = await ctx.params;

    const existente = await prisma.solicitacaoMatricula.findFirst({ where: { id, schoolId: session.schoolId } });
    if (!existente) return NextResponse.json({ error: "Solicitação não encontrada" }, { status: 404 });

    await prisma.solicitacaoMatricula.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
}
