import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { handleApiError } from "@/lib/http";
import { resumoAdocao, usoPorSemana } from "@/lib/adocao";

const SEMANAS = 8;

/**
 * Painel de adoção do ClassLink pelas famílias: total, por turma e uso semana a semana.
 * Só números agregados (nenhum nome sai daqui); a lista nominal continua em /api/admin/acessos.
 */
export async function GET() {
  try {
    const session = await requireRole("ADMIN");
    const agora = new Date();

    const responsaveis = await prisma.user.findMany({
      where: { schoolId: session.schoolId, role: "GUARDIAN", deletedAt: null, active: true },
      select: { id: true },
    });
    const ids = responsaveis.map((r) => r.id);

    const desde = new Date(agora.getTime() - SEMANAS * 7 * 24 * 60 * 60 * 1000);
    const [sessoes, pushes, alunos, sessoesRecentes] = await Promise.all([
      prisma.refreshToken.groupBy({
        by: ["userId"],
        where: { userId: { in: ids } },
        _min: { createdAt: true },
        _max: { createdAt: true },
      }),
      prisma.pushToken.groupBy({ by: ["userId"], where: { userId: { in: ids } }, _count: { _all: true } }),
      prisma.student.findMany({
        where: { schoolId: session.schoolId, deletedAt: null },
        select: { class: { select: { name: true } }, guardians: { select: { guardianId: true } } },
      }),
      prisma.refreshToken.findMany({
        where: { userId: { in: ids }, createdAt: { gte: desde } },
        select: { userId: true, createdAt: true },
      }),
    ]);

    const sessaoPor = new Map(sessoes.map((s) => [s.userId, s]));
    const comPush = new Set(pushes.filter((p) => p._count._all > 0).map((p) => p.userId));

    const resumo = resumoAdocao(
      ids.map((id) => ({
        id,
        primeiroAcesso: sessaoPor.get(id)?._min.createdAt ?? null,
        ultimoUso: sessaoPor.get(id)?._max.createdAt ?? null,
        notificacoesAtivas: comPush.has(id),
      })),
      alunos.map((a) => ({ turma: a.class?.name ?? null, responsaveis: a.guardians.map((g) => g.guardianId) })),
      agora,
    );

    return NextResponse.json({ ...resumo, semanas: usoPorSemana(sessoesRecentes, agora, SEMANAS) });
  } catch (error) {
    return handleApiError(error);
  }
}
