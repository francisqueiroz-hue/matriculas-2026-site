import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { handleApiError } from "@/lib/http";
import { notifyUsers } from "@/lib/push";

/** Reenvia a notificação push de um comunicado para um responsável específico que ainda não respondeu. */
export async function POST(_request: Request, ctx: RouteContext<"/api/comunicados/[id]/reenviar/[guardianId]">) {
  try {
    const session = await requireRole("ADMIN", "STAFF");
    const { id: comunicadoId, guardianId } = await ctx.params;

    const comunicado = await prisma.comunicado.findFirst({ where: { id: comunicadoId, schoolId: session.schoolId } });
    if (!comunicado) return NextResponse.json({ error: "Comunicado não encontrado" }, { status: 404 });

    const guardian = await prisma.user.findFirst({
      where: { id: guardianId, schoolId: session.schoolId, role: "GUARDIAN" },
    });
    if (!guardian) return NextResponse.json({ error: "Responsável não encontrado" }, { status: 404 });

    await notifyUsers([guardianId], {
      title: `Lembrete: ${comunicado.titulo}`,
      body: "Você ainda não respondeu a este comunicado. Toque para responder.",
      url: `/dashboard/comunicados/${comunicadoId}`,
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
}
