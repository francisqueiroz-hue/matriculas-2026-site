import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { SO_ESCOLAS_REAIS } from "@/lib/escola-demonstracao";
import { handleApiError } from "@/lib/http";
import { requireCronSecret } from "@/lib/cron-auth";
import { mesReferenciaAtual, agoraNoFusoDaEscola } from "@/lib/billing";
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
    const mesReferencia = mesReferenciaAtual(hoje);

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

    for (const escola of escolas) {
      const resultado = await gerarBoletosDoMes(escola, mesReferencia, hoje);
      criados += resultado.criados;
      emitidos += resultado.emitidos;
      erros += resultado.erros;
      ignorados += resultado.ignorados;
    }

    return NextResponse.json({ ok: true, escolasProcessadas: escolas.length, criados, emitidos, erros, ignorados });
  } catch (error) {
    return handleApiError(error);
  }
}
