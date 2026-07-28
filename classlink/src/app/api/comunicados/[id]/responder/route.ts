import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { handleApiError } from "@/lib/http";
import { responderComunicadoSchema } from "@/lib/validators";
import { RESPOSTAS_PERMITIDAS } from "@/lib/comunicados";

function getClientIp(request: NextRequest) {
  const forwardedFor = request.headers.get("x-forwarded-for");
  if (forwardedFor) return forwardedFor.split(",")[0].trim();
  return request.headers.get("x-real-ip");
}

/** Responsável autoriza/confirma/lê um comunicado para um aluno vinculado. Idempotente: reenvios atualizam o registro e preservam a resposta anterior em log. */
export async function POST(request: NextRequest, ctx: RouteContext<"/api/comunicados/[id]/responder">) {
  try {
    const session = await requireRole("GUARDIAN");
    const { id: comunicadoId } = await ctx.params;
    const body = responderComunicadoSchema.parse(await request.json());

    const comunicado = await prisma.comunicado.findFirst({
      where: { id: comunicadoId, schoolId: session.schoolId },
    });
    if (!comunicado) return NextResponse.json({ error: "Comunicado não encontrado" }, { status: 404 });

    if (comunicado.prazoResposta && comunicado.prazoResposta < new Date()) {
      return NextResponse.json({ error: "O prazo de resposta deste comunicado já expirou" }, { status: 400 });
    }

    const respostasValidas = RESPOSTAS_PERMITIDAS[comunicado.tipo];
    if (!respostasValidas.includes(body.resposta)) {
      return NextResponse.json(
        { error: `Resposta inválida para este tipo de comunicado. Opções: ${respostasValidas.join(", ")}` },
        { status: 400 },
      );
    }

    const vinculo = await prisma.guardianStudent.findUnique({
      where: { guardianId_studentId: { guardianId: session.sub, studentId: body.alunoId } },
      include: { student: { select: { classId: true, deletedAt: true } } },
    });
    if (!vinculo || vinculo.student.deletedAt) {
      return NextResponse.json({ error: "Aluno não vinculado a este responsável" }, { status: 403 });
    }
    if (comunicado.audience === "CLASS" && vinculo.student.classId !== comunicado.classId) {
      return NextResponse.json({ error: "Este comunicado não é destinado à turma deste aluno" }, { status: 403 });
    }

    const dataHoraResposta = new Date();
    const ipOrigem = getClientIp(request);

    const resultado = await prisma.$transaction(async (tx) => {
      const existente = await tx.respostaComunicado.findUnique({
        where: { comunicadoId_responsavelId_alunoId: { comunicadoId, responsavelId: session.sub, alunoId: body.alunoId } },
      });

      if (existente) {
        await tx.respostaComunicadoLog.create({
          data: {
            respostaComunicadoId: existente.id,
            respostaAnterior: existente.resposta,
            dataHoraRespostaAnterior: existente.dataHoraResposta,
            ipOrigemAnterior: existente.ipOrigem,
          },
        });
        return tx.respostaComunicado.update({
          where: { id: existente.id },
          data: { resposta: body.resposta, dataHoraResposta, ipOrigem },
        });
      }

      return tx.respostaComunicado.create({
        data: {
          comunicadoId,
          responsavelId: session.sub,
          alunoId: body.alunoId,
          resposta: body.resposta,
          dataHoraResposta,
          ipOrigem,
        },
      });
    });

    return NextResponse.json({ resposta: resultado });
  } catch (error) {
    return handleApiError(error);
  }
}
