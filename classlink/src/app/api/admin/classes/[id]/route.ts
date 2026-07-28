import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { handleApiError } from "@/lib/http";
import { updateClassSchema } from "@/lib/validators";

export async function PATCH(request: NextRequest, ctx: RouteContext<"/api/admin/classes/[id]">) {
  try {
    const session = await requireRole("ADMIN");
    const { id } = await ctx.params;
    const body = updateClassSchema.parse(await request.json());

    const existing = await prisma.class.findFirst({ where: { id, schoolId: session.schoolId } });
    if (!existing) return NextResponse.json({ error: "Turma não encontrada" }, { status: 404 });

    const updated = await prisma.class.update({ where: { id }, data: body });
    return NextResponse.json({ class: updated });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(_request: NextRequest, ctx: RouteContext<"/api/admin/classes/[id]">) {
  try {
    const session = await requireRole("ADMIN");
    const { id } = await ctx.params;

    const existing = await prisma.class.findFirst({ where: { id, schoolId: session.schoolId } });
    if (!existing) return NextResponse.json({ error: "Turma não encontrada" }, { status: 404 });

    await prisma.class.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
}
