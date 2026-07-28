import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { handleApiError } from "@/lib/http";
import { setMensalidadeSchema } from "@/lib/validators";

/** Configura o valor de mensalidade (e opcionalmente o dia de vencimento) de um aluno específico. */
export async function PUT(request: NextRequest, ctx: RouteContext<"/api/admin/students/[id]/billing">) {
  try {
    const session = await requireRole("ADMIN");
    const { id } = await ctx.params;
    const body = setMensalidadeSchema.parse(await request.json());

    const student = await prisma.student.findFirst({ where: { id, schoolId: session.schoolId } });
    if (!student) return NextResponse.json({ error: "Aluno não encontrado" }, { status: 404 });

    const updated = await prisma.student.update({
      where: { id },
      data: {
        mensalidadeValor: body.mensalidadeValor,
        ...(body.diaVencimento !== undefined ? { diaVencimento: body.diaVencimento } : {}),
      },
      select: { id: true, mensalidadeValor: true, diaVencimento: true },
    });

    return NextResponse.json({ student: updated });
  } catch (error) {
    return handleApiError(error);
  }
}
