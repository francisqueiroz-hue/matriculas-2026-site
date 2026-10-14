import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { handleApiError } from "@/lib/http";
import { filtroDeVisibilidade, turmasVisiveisNoMural } from "@/lib/visibilidade-posts";

/** Lista de quem já visualizou o aviso ("visto por"), visível para staff/admin. */
export async function GET(_request: Request, ctx: RouteContext<"/api/posts/[id]/reads">) {
  try {
    const session = await requireRole("ADMIN", "STAFF");
    const { id: postId } = await ctx.params;

    // Professor só vê quem leu os avisos das suas turmas (e da escola toda).
    const turmas = await turmasVisiveisNoMural(session);
    const post = await prisma.post.findFirst({ where: { id: postId, schoolId: session.schoolId, ...filtroDeVisibilidade(turmas) } });
    if (!post) return NextResponse.json({ error: "Aviso não encontrado" }, { status: 404 });

    const reads = await prisma.postRead.findMany({
      where: { postId },
      include: { user: { select: { id: true, name: true, role: true } } },
      orderBy: { readAt: "asc" },
    });

    return NextResponse.json({ reads });
  } catch (error) {
    return handleApiError(error);
  }
}
