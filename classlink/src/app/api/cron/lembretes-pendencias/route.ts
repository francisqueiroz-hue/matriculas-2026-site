import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { handleApiError } from "@/lib/http";
import { requireCronSecret } from "@/lib/cron-auth";
import { executarLembretesDaEscola, type ResultadoExecucao } from "@/lib/lembretes-server";

/**
 * Job diário (15h UTC = 12h de Brasília, depois do horário de lançar as baixas; ver vercel.json): lembra as famílias das pendências
 * abertas há alguns dias (contrato, autorização, mensalidade, rematrícula). Uma mensagem por
 * família, no máximo a cada N dias, e só nas escolas que ativaram em Gestão › Lembretes.
 * Nas demais, só registra as pendências (para contar os dias) e não envia nada.
 */
export const maxDuration = 60;

/**
 * Para de começar envios novos 40 s depois do início: sobra tempo para os que já saíram
 * terminarem (o WhatsApp espera até 15 s) antes do corte da Vercel aos 60 s.
 */
const TEMPO_PARA_NOVOS_ENVIOS_MS = 40_000;

// Vercel Cron só invoca via GET; POST para schedulers externos.
export async function GET(request: NextRequest) {
  return handle(request);
}
export async function POST(request: NextRequest) {
  return handle(request);
}

async function handle(request: NextRequest) {
  try {
    requireCronSecret(request);
    const encerrarEm = Date.now() + TEMPO_PARA_NOVOS_ENVIOS_MS;
    const escolas = await prisma.school.findMany({ select: { id: true } });
    const resultados: Array<ResultadoExecucao & { escola: string }> = [];
    for (const escola of escolas) {
      try {
        resultados.push({ escola: escola.id, ...(await executarLembretesDaEscola(escola.id, new Date(), { encerrarEm })) });
      } catch (err) {
        // Uma escola com erro não impede as outras.
        console.error("lembretes: falha na escola", escola.id, err);
      }
    }
    // Fica no registro da Vercel: permite conferir quantas famílias receberam e quantas ficaram para o dia seguinte.
    console.info("lembretes: execução", resultados);
    return NextResponse.json({ ok: true, resultados });
  } catch (error) {
    return handleApiError(error);
  }
}
