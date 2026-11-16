import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireDirecao } from "@/lib/session";
import { handleApiError } from "@/lib/http";
import { ErroDeUsuario } from "@/lib/erros";
import {
  AREAS_VISIBILIDADE,
  DEFINICOES_AREAS,
  PAPEIS_VISIBILIDADE,
  areaLiberada,
  definicaoDaArea,
  ehArea,
  ehPapel,
} from "@/lib/visibilidade";
import { escolhasDaEscola } from "@/lib/visibilidade-server";

const SEM_CACHE = { "Cache-Control": "private, no-store" };

/** Situação de cada área para cada perfil, mais as últimas 50 mudanças. Só a direção. */
export async function GET() {
  try {
    const session = await requireDirecao();
    const [escolhas, historico] = await Promise.all([
      escolhasDaEscola(session.schoolId),
      prisma.visibilidadeHistorico.findMany({
        where: { schoolId: session.schoolId },
        orderBy: { createdAt: "desc" },
        take: 50,
        select: { id: true, area: true, papel: true, liberado: true, autorNome: true, createdAt: true },
      }),
    ]);
    const liberado: Record<string, Record<string, boolean>> = {};
    for (const def of DEFINICOES_AREAS) {
      liberado[def.id] = Object.fromEntries(PAPEIS_VISIBILIDADE.map((p) => [p, areaLiberada(def.id, p, escolhas)]));
    }
    return NextResponse.json(
      { liberado, historico: historico.filter((h) => ehArea(h.area) && ehPapel(h.papel)) },
      { headers: SEM_CACHE },
    );
  } catch (error) {
    return handleApiError(error);
  }
}

const mudancaSchema = z.object({
  area: z.enum(AREAS_VISIBILIDADE),
  papel: z.enum(PAPEIS_VISIBILIDADE),
  liberado: z.boolean(),
  /** Obrigatório (true) para liberar uma área sensível: a tela pede a confirmação antes. */
  confirmado: z.boolean().optional(),
});

/** Liga ou desliga uma área para um perfil e registra quem mudou e quando. Só a direção. */
export async function PUT(request: NextRequest) {
  try {
    const session = await requireDirecao();
    const { area, papel, liberado, confirmado } = mudancaSchema.parse(await request.json());

    const celula = definicaoDaArea(area).celulas[papel];
    if (celula.tipo === "fixo") {
      throw new ErroDeUsuario(`Esta área não pode ser liberada para este perfil (${celula.motivo}).`, 400);
    }
    if (liberado && celula.sensivel && confirmado !== true) {
      throw new ErroDeUsuario("Confirme antes de liberar uma área com dados sensíveis.", 400);
    }

    const autor = await prisma.user.findUnique({ where: { id: session.sub }, select: { name: true } });
    const atual = areaLiberada(area, papel, await escolhasDaEscola(session.schoolId, papel));

    await prisma.$transaction(async (tx) => {
      await tx.visibilidadeArea.upsert({
        where: { schoolId_area_papel: { schoolId: session.schoolId, area, papel } },
        create: { schoolId: session.schoolId, area, papel, liberado, atualizadoPorId: session.sub },
        update: { liberado, atualizadoPorId: session.sub },
      });
      // Só registra quando muda de fato (clique repetido não polui o histórico).
      if (atual !== liberado) {
        await tx.visibilidadeHistorico.create({
          data: {
            schoolId: session.schoolId,
            area,
            papel,
            liberado,
            autorId: session.sub,
            autorNome: autor?.name ?? session.name,
          },
        });
      }
    });

    return NextResponse.json({ ok: true, area, papel, liberado }, { headers: SEM_CACHE });
  } catch (error) {
    return handleApiError(error);
  }
}
