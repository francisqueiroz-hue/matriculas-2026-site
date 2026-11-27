import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { SO_ESCOLAS_REAIS } from "@/lib/escola-demonstracao";
import { handleApiError } from "@/lib/http";
import { requireCronSecret } from "@/lib/cron-auth";
import { mesDoLancamentoAutomatico, agoraNoFusoDaEscola } from "@/lib/billing";
import { gerarBoletosDoMes } from "@/lib/boleto-emissao";

const DIA_EMISSAO_PADRAO = 1;

// Emissão + avisos de várias famílias podem passar do limite padrão da função.
export const maxDuration = 60;

// Vercel Cron só invoca via GET; aceitamos POST também para schedulers externos.
export async function GET(request: NextRequest) {
  return handle(request);
}
export async function POST(request: NextRequest) {
  return handle(request);
}

async function handle(request: NextRequest) {
  try {
    requireCronSecret(request);

    // "Hoje" no fuso do Brasil — o servidor roda em UTC, e perto da meia-noite em
    // Brasília isso pode ser um dia (ou mês) diferente de `new Date()` puro.
    const hoje = agoraNoFusoDaEscola();
    const diaHoje = hoje.getDate();
    // Depois do dia 05, lança o mês seguinte (vence no dia 05 dele), a partir de jan/2027.
    const mesReferencia = mesDoLancamentoAutomatico(hoje);
    if (!mesReferencia) {
      return NextResponse.json({ ok: true, escolasProcessadas: 0, criados: 0, emitidos: 0, erros: 0, ignorados: 0, semValorDoContrato: 0, mesReferencia: null });
    }

    // Roda para escolas com o dia configurado explicitamente, e para as sem configuração
    // apenas quando hoje é o dia padrão (evita disparar todo dia para quem não configurou).
    // Note que gerarBoletosDoMes cria o valor mesmo sem o Banco Inter configurado — a
    // emissão real (boleto/PIX pagável) só é tentada quando o Inter estiver configurado.
    const escolas = await prisma.school.findMany({
      // Escola de demonstração nunca gera boleto (nem chama o Banco Inter).
      where:
        diaHoje === DIA_EMISSAO_PADRAO
          ? { ...SO_ESCOLAS_REAIS, OR: [{ diaEmissaoBoletos: diaHoje }, { diaEmissaoBoletos: null }] }
          : { ...SO_ESCOLAS_REAIS, diaEmissaoBoletos: diaHoje },
      select: { id: true, diaVencimentoPadrao: true },
    });

    let criados = 0;
    let emitidos = 0;
    let erros = 0;
    let ignorados = 0;
    let semValorDoContrato = 0;

    for (const escola of escolas) {
      const resultado = await gerarBoletosDoMes(escola, mesReferencia);
      criados += resultado.criados;
      emitidos += resultado.emitidos;
      erros += resultado.erros;
      ignorados += resultado.ignorados;
      semValorDoContrato += resultado.semValorDoContrato.length;
      if (resultado.semValorDoContrato.length > 0) console.warn("boletos sem valor do contrato", escola.id, resultado.semValorDoContrato.length);
    }

    return NextResponse.json({ ok: true, escolasProcessadas: escolas.length, criados, emitidos, erros, ignorados, semValorDoContrato, mesReferencia });
  } catch (error) {
    return handleApiError(error);
  }
}
