import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/session";
import { handleApiError } from "@/lib/http";
import { dataParaDate, dateParaData, somarDias } from "@/lib/cardapios";
import { exigirGestaoCardapio } from "@/lib/cardapios-acesso";

const schema = z.object({ semanas: z.number().int().min(1).max(12) });

/**
 * Repete o cardápio nas próximas N semanas (mesmo público), já agendado. Semanas que já
 * têm cardápio ficam como estão.
 */
export async function POST(request: NextRequest, ctx: RouteContext<"/api/cardapios/[id]/duplicar">) {
  try {
    const session = await requireSession();
    await exigirGestaoCardapio(session.sub);
    const { id } = await ctx.params;
    const { semanas } = schema.parse(await request.json());

    const origem = await prisma.cardapio.findFirst({ where: { id, schoolId: session.schoolId } });
    if (!origem) return NextResponse.json({ error: "Cardápio não encontrado" }, { status: 404 });

    const criadas: string[] = [];
    const puladas: string[] = [];
    for (let i = 1; i <= semanas; i++) {
      const semana = somarDias(dateParaData(origem.semanaInicio), 7 * i);
      const jaExiste = await prisma.cardapio.findFirst({
        where: { schoolId: session.schoolId, classId: origem.classId, semanaInicio: dataParaDate(semana) },
        select: { id: true },
      });
      if (jaExiste) {
        puladas.push(semana);
        continue;
      }
      await prisma.cardapio.create({
        data: {
          schoolId: session.schoolId,
          classId: origem.classId,
          semanaInicio: dataParaDate(semana),
          conteudo: origem.conteudo ?? {},
          observacoes: origem.observacoes,
          imagemPath: origem.imagemPath,
          criadoPorId: session.sub,
        },
      });
      criadas.push(semana);
    }
    return NextResponse.json({ criadas, puladas });
  } catch (error) {
    return handleApiError(error);
  }
}
