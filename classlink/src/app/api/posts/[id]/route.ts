import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { ehGestaoDaSessao, requireSession } from "@/lib/session";
import { handleApiError } from "@/lib/http";
import { updatePostSchema } from "@/lib/validators";
import { exigirArea } from "@/lib/visibilidade-server";

export async function PATCH(request: NextRequest, ctx: RouteContext<"/api/posts/[id]">) {
  try {
    const session = await requireSession();
    await exigirArea(session, "MURAL");
    const { id } = await ctx.params;
    const body = updatePostSchema.parse(await request.json());

    const post = await prisma.post.findFirst({ where: { id, schoolId: session.schoolId } });
    if (!post) return NextResponse.json({ error: "Aviso não encontrado" }, { status: 404 });
    if (post.authorId !== session.sub && !(await ehGestaoDaSessao(session))) {
      return NextResponse.json({ error: "Sem permissão para editar este aviso" }, { status: 403 });
    }

    const updated = await prisma.post.update({
      where: { id },
      data: {
        ...(body.title !== undefined ? { title: body.title } : {}),
        ...(body.body !== undefined ? { body: body.body } : {}),
      },
    });

    return NextResponse.json({ post: updated });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(_request: NextRequest, ctx: RouteContext<"/api/posts/[id]">) {
  try {
    const session = await requireSession();
    await exigirArea(session, "MURAL");
    const { id } = await ctx.params;

    const post = await prisma.post.findFirst({ where: { id, schoolId: session.schoolId } });
    if (!post) return NextResponse.json({ error: "Aviso não encontrado" }, { status: 404 });
    if (post.authorId !== session.sub && !(await ehGestaoDaSessao(session))) {
      return NextResponse.json({ error: "Sem permissão para remover este aviso" }, { status: 403 });
    }

    await prisma.post.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
}
