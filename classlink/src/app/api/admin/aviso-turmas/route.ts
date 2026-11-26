import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireDirecao } from "@/lib/session";
import { handleApiError } from "@/lib/http";
import { configAvisoTurmasSchema } from "@/lib/validators";

/**
 * A direção liga/desliga o aviso único de definição das turmas e edita o texto. Texto vazio volta
 * ao padrão. Só a direção (a secretaria não mexe em mensagens automáticas às famílias).
 */
export async function PUT(request: NextRequest) {
  try {
    const session = await requireDirecao();
    const body = configAvisoTurmasSchema.parse(await request.json());
    const escola = await prisma.school.update({
      where: { id: session.schoolId },
      data: { avisoTurmasAtivo: body.ativo, avisoTurmasTitulo: body.titulo, avisoTurmasTexto: body.texto },
      select: { avisoTurmasAtivo: true },
    });
    return NextResponse.json({ ok: true, ativo: escola.avisoTurmasAtivo });
  } catch (error) {
    return handleApiError(error);
  }
}
