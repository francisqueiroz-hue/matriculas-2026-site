import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
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

    try {
      await prisma.postRead.upsert({
        where: { postId_userId: { postId, userId: session.sub } },
        update: {},
        create: { postId, userId: session.sub },
      });
    } catch (error) {
      // Duplo clique/duas abas confirmando ao mesmo tempo: a leitura já foi registrada, então
      // o resultado desejado já existe — não é um erro do ponto de vista de quem usa o app.
      const isDuplicate = error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
      if (!isDuplicate) throw error;
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
}
