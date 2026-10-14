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

    // Quem deveria ter visto e ainda não abriu: responsáveis ativos da turma (ou da escola toda).
    const destinatarios = await prisma.user.findMany({
      where: {
        schoolId: session.schoolId,
        role: "GUARDIAN",
        active: true,
        deletedAt: null,
        studentLinks: {
          some: { student: { deletedAt: null, ...(post.audience === "CLASS" && post.classId ? { classId: post.classId } : {}) } },
        },
      },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    });
    const leram = new Set(reads.map((r) => r.user.id));
    const pendentes = destinatarios.filter((d) => !leram.has(d.id));

    return NextResponse.json({ reads, pendentes });
  } catch (error) {
    return handleApiError(error);
  }
}
