import type { ComunicadoTipo, RespostaTipo } from "@prisma/client";
import { prisma } from "@/lib/prisma";

/** Respostas válidas por tipo de comunicado — determina os botões exibidos ao responsável. */
export const RESPOSTAS_PERMITIDAS: Record<ComunicadoTipo, RespostaTipo[]> = {
  AUTORIZACAO_PASSEIO: ["AUTORIZADO", "NAO_AUTORIZADO"],
  CONFIRMACAO_REUNIAO: ["CONFIRMADO", "NAO_COMPARECERA"],
  CIRCULAR: ["LIDO"],
};

/** Pares responsável/aluno que compõem o público-alvo de um comunicado (para contagem e cobrança de resposta). */
export async function getPublicoAlvo(comunicadoId: string) {
  const comunicado = await prisma.comunicado.findUniqueOrThrow({
    where: { id: comunicadoId },
    select: { schoolId: true, audience: true, classId: true, alunoId: true },
  });

  const links = await prisma.guardianStudent.findMany({
    where: {
      guardian: { schoolId: comunicado.schoolId, active: true, deletedAt: null },
      student: {
        deletedAt: null,
        ...(comunicado.audience === "CLASS" ? { classId: comunicado.classId ?? undefined } : {}),
        ...(comunicado.audience === "STUDENT" ? { id: comunicado.alunoId ?? undefined } : {}),
      },
    },
    select: {
      guardianId: true,
      studentId: true,
      guardian: { select: { id: true, name: true, email: true } },
      student: { select: { id: true, name: true } },
    },
  });

  return links;
}
