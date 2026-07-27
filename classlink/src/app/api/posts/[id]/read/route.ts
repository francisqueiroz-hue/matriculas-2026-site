import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/session";
import { handleApiError } from "@/lib/http";

/** Confirma a leitura do aviso pelo usuário atual (idempotente). */
export async function POST(_request: NextRequest, ctx: RouteContext<"/api/posts/[id]/read">) {
  try {
    const session = await requireSession();
    const { id: postId } = await ctx.params;

    const post = await prisma.post.findFirst({ where: { id: postId, schoolId: session.schoolId } });
    if (!post) return NextResponse.json({ error: "Aviso não encontrado" }, { status: 404 });

    await prisma.postRead.upsert({
      where: { postId_userId: { postId, userId: session.sub } },
      update: {},
      create: { postId, userId: session.sub },
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
}
