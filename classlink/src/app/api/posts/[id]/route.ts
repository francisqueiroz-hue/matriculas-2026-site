import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/session";
import { handleApiError } from "@/lib/http";

export async function DELETE(_request: NextRequest, ctx: RouteContext<"/api/posts/[id]">) {
  try {
    const session = await requireSession();
    const { id } = await ctx.params;

    const post = await prisma.post.findFirst({ where: { id, schoolId: session.schoolId } });
    if (!post) return NextResponse.json({ error: "Aviso não encontrado" }, { status: 404 });
    if (post.authorId !== session.sub && session.role !== "ADMIN") {
      return NextResponse.json({ error: "Sem permissão para remover este aviso" }, { status: 403 });
    }

    await prisma.post.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
}
