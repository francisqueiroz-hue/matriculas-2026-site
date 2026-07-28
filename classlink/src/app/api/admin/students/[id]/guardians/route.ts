import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { handleApiError } from "@/lib/http";
import { linkGuardianSchema } from "@/lib/validators";
import { hashPassword } from "@/lib/auth";

/** Vincula um responsável (existente ou novo) a um aluno. Vínculo explícito e revogável (LGPD). */
export async function POST(request: NextRequest, ctx: RouteContext<"/api/admin/students/[id]/guardians">) {
  try {
    const session = await requireRole("ADMIN");
    const { id: studentId } = await ctx.params;
    const body = linkGuardianSchema.parse(await request.json());

    const student = await prisma.student.findFirst({ where: { id: studentId, schoolId: session.schoolId } });
    if (!student) return NextResponse.json({ error: "Aluno não encontrado" }, { status: 404 });

    let guardian = await prisma.user.findUnique({ where: { email: body.guardianEmail.toLowerCase() } });
    let temporaryPassword: string | undefined;

    if (!guardian) {
      temporaryPassword = body.password ?? randomBytes(6).toString("hex");
      guardian = await prisma.user.create({
        data: {
          email: body.guardianEmail.toLowerCase(),
          name: body.guardianName,
          role: "GUARDIAN",
          schoolId: session.schoolId,
          passwordHash: await hashPassword(temporaryPassword),
        },
      });
    } else if (guardian.schoolId !== session.schoolId || guardian.role !== "GUARDIAN") {
      return NextResponse.json({ error: "E-mail já usado por outro usuário nesta ou noutra escola" }, { status: 409 });
    }

    const link = await prisma.guardianStudent.upsert({
      where: { guardianId_studentId: { guardianId: guardian.id, studentId } },
      update: { relation: body.relation },
      create: { guardianId: guardian.id, studentId, relation: body.relation },
    });

    return NextResponse.json(
      { link, guardian: { id: guardian.id, email: guardian.email, name: guardian.name }, temporaryPassword },
      { status: 201 },
    );
  } catch (error) {
    return handleApiError(error);
  }
}
