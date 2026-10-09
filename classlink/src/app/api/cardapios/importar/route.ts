import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/session";
import { handleApiError } from "@/lib/http";
import { dataParaDate, importarCardapiosSchema, publicarCardapiosDevidos, segundaAtual } from "@/lib/cardapios";
import { exigirGestaoCardapio } from "@/lib/cardapios-acesso";

/**
 * Importa vários cardápios de uma vez (ex.: o trimestre enviado pela nutricionista): para
 * cada semana × segmento × turma, cria o cardápio agendado. Semanas que já passaram e
 * combinações que já têm cardápio ficam de fora (nada é sobrescrito).
 */
export async function POST(request: NextRequest) {
  try {
    const session = await requireSession();
    await exigirGestaoCardapio(session.sub);
    const body = importarCardapiosSchema.parse(await request.json());

    const turmasPedidas = [...new Set(body.segmentos.flatMap((s) => s.classIds ?? []))];
    const turmas = await prisma.class.findMany({ where: { id: { in: turmasPedidas }, schoolId: session.schoolId }, select: { id: true } });
    if (turmas.length !== turmasPedidas.length) {
      return NextResponse.json({ error: "Alguma turma escolhida não foi encontrada." }, { status: 404 });
    }
    // A mesma turma não pode receber dois cardápios diferentes na mesma semana.
    const destinos = body.segmentos.flatMap((s) => (s.classIds === null ? ["__escola__"] : s.classIds));
    if (new Set(destinos).size !== destinos.length) {
      return NextResponse.json({ error: "Uma turma foi marcada em mais de um cardápio. Deixe cada turma em um só." }, { status: 400 });
    }

    const atual = segundaAtual();
    const semanas = [...new Set(body.semanas)].sort();
    const ignoradasPassadas = semanas.filter((s) => s < atual);

    let criados = 0;
    let jaExistiam = 0;
    for (const semana of semanas.filter((s) => s >= atual)) {
      for (const seg of body.segmentos) {
        const alvos: (string | null)[] = seg.classIds === null ? [null] : seg.classIds;
        for (const classId of alvos) {
          const existe = await prisma.cardapio.findFirst({
            where: { schoolId: session.schoolId, classId, semanaInicio: dataParaDate(semana) },
            select: { id: true },
          });
          if (existe) {
            jaExistiam++;
            continue;
          }
          await prisma.cardapio.create({
            data: {
              schoolId: session.schoolId,
              classId,
              semanaInicio: dataParaDate(semana),
              conteudo: seg.conteudo,
              observacoes: body.observacoes || null,
              criadoPorId: session.sub,
            },
          });
          criados++;
        }
      }
    }
    // Se a semana atual estava no pacote e já passou das 6h de segunda, sai na hora.
    const publicadosAgora = await publicarCardapiosDevidos(new Date(), session.schoolId);

    return NextResponse.json({ criados, jaExistiam, semanasIgnoradas: ignoradasPassadas, publicadosAgora });
  } catch (error) {
    return handleApiError(error);
  }
}
