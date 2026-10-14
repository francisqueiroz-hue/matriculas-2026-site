import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { handleApiError } from "@/lib/http";
import { ErroDeUsuario } from "@/lib/erros";

/** Encerra a enquete antes do prazo (quem criou ou a administração). */
export async function POST(_request: Request, ctx: RouteContext<"/api/enquetes/[id]/encerrar">) {
  try {
    const session = await requireRole("ADMIN", "STAFF");
    const { id } = await ctx.params;
    const enquete = await prisma.enquete.findFirst({
      where: { id, schoolId: session.schoolId },
      select: { criadoPorId: true, encerradaEm: true },
    });
    if (!enquete) throw new ErroDeUsuario("Enquete não encontrada.", 404);
    if (session.role !== "ADMIN" && enquete.criadoPorId !== session.sub) {
      throw new ErroDeUsuario("Só quem criou a enquete ou a administração pode encerrá-la.", 403);
    }
    if (!enquete.encerradaEm) await prisma.enquete.update({ where: { id }, data: { encerradaEm: new Date() } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
}
