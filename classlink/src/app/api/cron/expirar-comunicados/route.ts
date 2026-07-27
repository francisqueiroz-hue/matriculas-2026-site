import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { handleApiError } from "@/lib/http";
import { requireCronSecret } from "@/lib/cron-auth";
import { getPublicoAlvo } from "@/lib/comunicados";

/**
 * Job diário: para comunicados cujo prazo_resposta já passou, marca como
 * "pendente_expirado" todo par responsável/aluno do público-alvo que ainda
 * não tinha registrado nenhuma resposta. Gerado pelo servidor, nunca pelo cliente.
 */
// Vercel Cron só invoca via GET; aceitamos POST também para schedulers externos (ex: cron-job.org).
export async function GET(request: NextRequest) {
  return handle(request);
}

export async function POST(request: NextRequest) {
  return handle(request);
}

async function handle(request: NextRequest) {
  try {
    requireCronSecret(request);

    const comunicadosVencidos = await prisma.comunicado.findMany({
      where: { prazoResposta: { lt: new Date() } },
      select: { id: true },
    });

    const agora = new Date();
    let totalMarcados = 0;

    for (const { id: comunicadoId } of comunicadosVencidos) {
      const [publicoAlvo, respondidos] = await Promise.all([
        getPublicoAlvo(comunicadoId),
        prisma.respostaComunicado.findMany({ where: { comunicadoId }, select: { responsavelId: true, alunoId: true } }),
      ]);

      const respondidosSet = new Set(respondidos.map((r) => `${r.responsavelId}:${r.alunoId}`));
      const pendentes = publicoAlvo.filter((p) => !respondidosSet.has(`${p.guardianId}:${p.studentId}`));
      if (pendentes.length === 0) continue;

      const resultado = await prisma.respostaComunicado.createMany({
        data: pendentes.map((p) => ({
          comunicadoId,
          responsavelId: p.guardianId,
          alunoId: p.studentId,
          resposta: "PENDENTE_EXPIRADO" as const,
          dataHoraResposta: agora,
          ipOrigem: null,
        })),
        skipDuplicates: true,
      });
      totalMarcados += resultado.count;
    }

    return NextResponse.json({ ok: true, comunicadosVerificados: comunicadosVencidos.length, marcadosComoExpirados: totalMarcados });
  } catch (error) {
    return handleApiError(error);
  }
}
