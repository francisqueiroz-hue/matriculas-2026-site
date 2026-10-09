import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/session";
import { handleApiError } from "@/lib/http";
import { dataParaDate, publicarCardapiosDevidos, salvarCardapioSchema, segundaAtual, somarDias } from "@/lib/cardapios";
import { exigirGestaoCardapio, paraTela, turmasVisiveis } from "@/lib/cardapios-acesso";
import { perfilDoUsuario } from "@/lib/permissoes-mensagens";

const INCLUDE = { class: { select: { name: true } } } as const;

/**
 * Cardápios: a gestão vê os agendados e os das últimas semanas; famílias e professores,
 * os publicados das turmas que acompanham (e os da escola toda).
 */
export async function GET() {
  try {
    const session = await requireSession();
    // Reserva do cron: se a segunda já passou das 6h e o cardápio ainda não saiu, publica agora.
    await publicarCardapiosDevidos(new Date(), session.schoolId).catch((err) => console.error("publicação do cardápio falhou", err));

    const podeEditar = (await perfilDoUsuario(session.sub)) === "gestao";
    const semana = segundaAtual();
    const turmas = await turmasVisiveis(session);

    const cardapios = await prisma.cardapio.findMany({
      where: {
        schoolId: session.schoolId,
        ...(podeEditar
          ? { semanaInicio: { gte: dataParaDate(somarDias(semana, -28)) } }
          : { status: "PUBLICADO", semanaInicio: { gte: dataParaDate(somarDias(semana, -21)) } }),
        ...(turmas === null ? {} : { OR: [{ classId: null }, { classId: { in: turmas } }] }),
      },
      include: INCLUDE,
      orderBy: [{ semanaInicio: "desc" }, { classId: "asc" }],
    });

    return NextResponse.json({ podeEditar, segundaAtual: semana, cardapios: await Promise.all(cardapios.map(paraTela)) });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await requireSession();
    await exigirGestaoCardapio(session.sub);
    const body = salvarCardapioSchema.parse(await request.json());

    if (body.semanaInicio < segundaAtual()) {
      return NextResponse.json({ error: "Essa semana já passou. Escolha a semana atual ou uma próxima." }, { status: 400 });
    }
    const classId = body.classId ?? null;
    if (classId) {
      const turma = await prisma.class.findFirst({ where: { id: classId, schoolId: session.schoolId } });
      if (!turma) return NextResponse.json({ error: "Turma não encontrada" }, { status: 404 });
    }
    const existente = await prisma.cardapio.findFirst({
      where: { schoolId: session.schoolId, classId, semanaInicio: dataParaDate(body.semanaInicio) },
    });
    if (existente) {
      return NextResponse.json({ error: "Já existe um cardápio para essa semana e esse público. Edite o existente." }, { status: 409 });
    }

    const criado = await prisma.cardapio.create({
      data: {
        schoolId: session.schoolId,
        classId,
        semanaInicio: dataParaDate(body.semanaInicio),
        conteudo: body.conteudo,
        observacoes: body.observacoes || null,
        imagemPath: body.imagemPath || null,
        criadoPorId: session.sub,
      },
    });
    // Cardápio da semana atual cadastrado depois das 6h de segunda: publica na hora.
    await publicarCardapiosDevidos(new Date(), session.schoolId);

    const cardapio = await prisma.cardapio.findUniqueOrThrow({ where: { id: criado.id }, include: INCLUDE });
    return NextResponse.json({ cardapio: await paraTela(cardapio) }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
