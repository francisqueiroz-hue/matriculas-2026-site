import { NextRequest, NextResponse } from "next/server";
import { ZodError } from "zod";
import { prisma } from "@/lib/prisma";
import {
  ANO_LETIVO_MATRICULAS,
  CORS_HEADERS,
  JANELA_LIMITE_MS,
  LIMITE_ENVIOS_POR_IP,
  getClientIp,
  normalizarTelefone,
  solicitacaoPublicaSchema,
} from "@/lib/solicitacoes-matricula";

/**
 * Escola que recebe os formulários públicos: MATRICULAS_SCHOOL_ID, ou a única escola
 * cadastrada. Com mais de uma escola e sem a variável, recusa em vez de adivinhar.
 */
async function escolaDasMatriculas(): Promise<string | null> {
  if (process.env.MATRICULAS_SCHOOL_ID) return process.env.MATRICULAS_SCHOOL_ID;
  const escolas = await prisma.school.findMany({ select: { id: true }, take: 2 });
  return escolas.length === 1 ? escolas[0].id : null;
}

function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: CORS_HEADERS });
}

export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

/** Endpoint público (sem login) usado pelos formulários de pré-matrícula e rematrícula. */
export async function POST(request: NextRequest) {
  try {
    const body = solicitacaoPublicaSchema.parse(await request.json());

    const ipOrigem = getClientIp(request);
    if (ipOrigem) {
      const recentes = await prisma.solicitacaoMatricula.count({
        where: { ipOrigem, createdAt: { gte: new Date(Date.now() - JANELA_LIMITE_MS) } },
      });
      if (recentes >= LIMITE_ENVIOS_POR_IP) {
        return json({ error: "Muitos envios em pouco tempo. Tente novamente em alguns minutos." }, 429);
      }
    }

    const schoolId = await escolaDasMatriculas();
    if (!schoolId) {
      console.error("Defina MATRICULAS_SCHOOL_ID: há mais de uma escola (ou nenhuma) cadastrada.");
      return json({ error: "Cadastro de matrículas indisponível no momento." }, 503);
    }

    const solicitacao = await prisma.solicitacaoMatricula.create({
      data: {
        schoolId,
        tipo: body.tipo,
        origem: body.origem,
        anoLetivo: ANO_LETIVO_MATRICULAS,
        responsavelNome: body.responsavelNome,
        telefone: normalizarTelefone(body.telefone),
        alunoNome: body.alunoNome,
        serie: body.serie,
        periodoVisita: body.periodoVisita,
        escolaAtual: body.escolaAtual,
        observacoes: body.observacoes,
        consentimentoEm: new Date(),
        ipOrigem,
      },
      select: { id: true },
    });

    return json({ ok: true, id: solicitacao.id }, 201);
  } catch (error) {
    if (error instanceof ZodError || error instanceof SyntaxError) {
      return json({ error: "Dados inválidos" }, 400);
    }
    console.error(error);
    return json({ error: "Erro ao registrar a solicitação" }, 500);
  }
}
