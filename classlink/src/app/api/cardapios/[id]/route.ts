import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/session";
import { handleApiError } from "@/lib/http";
import { atualizarPublicacao, conteudoCardapioSchema } from "@/lib/cardapios";
import { exigirGestaoCardapio, paraTela } from "@/lib/cardapios-acesso";
import { z } from "zod";

const editarSchema = z.object({
  conteudo: conteudoCardapioSchema.optional(),
  observacoes: z.string().trim().max(1000).nullable().optional(),
  imagemPath: z.string().max(500).nullable().optional(),
});

/** Edita o cardápio (a semana e o público não mudam). Se já publicado, atualiza o Mural. */
export async function PATCH(request: NextRequest, ctx: RouteContext<"/api/cardapios/[id]">) {
  try {
    const session = await requireSession();
    await exigirGestaoCardapio(session.sub);
    const { id } = await ctx.params;
    const body = editarSchema.parse(await request.json());

    const existente = await prisma.cardapio.findFirst({ where: { id, schoolId: session.schoolId } });
    if (!existente) return NextResponse.json({ error: "Cardápio não encontrado" }, { status: 404 });

    await prisma.cardapio.update({
      where: { id },
      data: {
        ...(body.conteudo && { conteudo: body.conteudo }),
        ...(body.observacoes !== undefined && { observacoes: body.observacoes || null }),
        ...(body.imagemPath !== undefined && { imagemPath: body.imagemPath || null }),
      },
    });
    if (existente.status === "PUBLICADO") await atualizarPublicacao(id);

    const cardapio = await prisma.cardapio.findUniqueOrThrow({ where: { id }, include: { class: { select: { name: true } } } });
    return NextResponse.json({ cardapio: await paraTela(cardapio) });
  } catch (error) {
    return handleApiError(error);
  }
}

/** Exclui o cardápio; se já tinha sido publicado, a publicação do Mural sai junto. */
export async function DELETE(_request: NextRequest, ctx: RouteContext<"/api/cardapios/[id]">) {
  try {
    const session = await requireSession();
    await exigirGestaoCardapio(session.sub);
    const { id } = await ctx.params;
    const existente = await prisma.cardapio.findFirst({ where: { id, schoolId: session.schoolId } });
    if (!existente) return NextResponse.json({ error: "Cardápio não encontrado" }, { status: 404 });

    await prisma.cardapio.delete({ where: { id } });
    if (existente.postId) await prisma.post.delete({ where: { id: existente.postId } }).catch(() => undefined);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
}
