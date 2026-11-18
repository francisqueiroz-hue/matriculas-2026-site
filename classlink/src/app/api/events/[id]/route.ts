import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { ehGestaoDaSessao, requireSession } from "@/lib/session";
import { handleApiError } from "@/lib/http";
import { exigirArea } from "@/lib/visibilidade-server";

export async function DELETE(_request: NextRequest, ctx: RouteContext<"/api/events/[id]">) {
  try {
    const session = await requireSession();
    await exigirArea(session, "AGENDA");
    const { id } = await ctx.params;

    const event = await prisma.event.findFirst({ where: { id, schoolId: session.schoolId } });
    if (!event) return NextResponse.json({ error: "Evento não encontrado" }, { status: 404 });
    if (event.authorId !== session.sub && !(await ehGestaoDaSessao(session))) {
      return NextResponse.json({ error: "Sem permissão para remover este evento" }, { status: 403 });
    }

    await prisma.event.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
}
