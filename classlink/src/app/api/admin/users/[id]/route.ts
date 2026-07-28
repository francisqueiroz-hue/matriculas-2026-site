import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { handleApiError } from "@/lib/http";
import { updateUserSchema } from "@/lib/validators";

export async function PATCH(request: NextRequest, ctx: RouteContext<"/api/admin/users/[id]">) {
  try {
    const session = await requireRole("ADMIN");
    const { id } = await ctx.params;
    const body = updateUserSchema.parse(await request.json());

    const existing = await prisma.user.findFirst({ where: { id, schoolId: session.schoolId } });
    if (!existing) return NextResponse.json({ error: "Usuário não encontrado" }, { status: 404 });

    const user = await prisma.$transaction(async (tx) => {
      if (body.classIds && existing.role === "STAFF") {
        await tx.classTeacher.deleteMany({ where: { teacherId: id } });
        await tx.classTeacher.createMany({
          data: body.classIds.map((classId) => ({ classId, teacherId: id })),
        });
      }
      return tx.user.update({
        where: { id },
        data: {
          ...(body.name ? { name: body.name } : {}),
          ...(body.phone !== undefined ? { phone: body.phone } : {}),
          ...(body.active !== undefined ? { active: body.active } : {}),
        },
      });
    });

    return NextResponse.json({ user: { id: user.id, name: user.name, active: user.active } });
  } catch (error) {
    return handleApiError(error);
  }
}

/** Exclusão lógica de conta gerida pelo admin (ex.: funcionário desligado). */
export async function DELETE(_request: NextRequest, ctx: RouteContext<"/api/admin/users/[id]">) {
  try {
    const session = await requireRole("ADMIN");
    const { id } = await ctx.params;

    const existing = await prisma.user.findFirst({ where: { id, schoolId: session.schoolId } });
    if (!existing) return NextResponse.json({ error: "Usuário não encontrado" }, { status: 404 });
    if (existing.id === session.sub) {
      return NextResponse.json({ error: "Use a exclusão de conta para remover seu próprio usuário" }, { status: 400 });
    }

    await prisma.user.update({ where: { id }, data: { active: false, deletedAt: new Date() } });
    await prisma.refreshToken.updateMany({ where: { userId: id, revokedAt: null }, data: { revokedAt: new Date() } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
}
