import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { handleApiError } from "@/lib/http";
import { mesReferenciaAtual, agoraNoFusoDaEscola } from "@/lib/billing";
import { gerarBoletosDoMes } from "@/lib/boleto-emissao";

/**
 * Gera agora os boletos (valor + vencimento) do mês corrente para os alunos desta escola
 * que ainda não têm um registro — sem esperar o job agendado (que só roda no dia de
 * emissão configurado). Útil sobretudo enquanto o Banco Inter ainda não está configurado:
 * o responsável já passa a ver o valor da mensalidade em "Financeiro" mesmo sem emissão
 * real habilitada.
 */
export async function POST() {
  try {
    const session = await requireRole("ADMIN");
    const escola = await prisma.school.findUniqueOrThrow({
      where: { id: session.schoolId },
      select: { id: true, diaVencimentoPadrao: true },
    });

    const hoje = agoraNoFusoDaEscola();
    const mesReferencia = mesReferenciaAtual(hoje);
    const resultado = await gerarBoletosDoMes(escola, mesReferencia, hoje);

    return NextResponse.json({ mesReferencia, ...resultado });
  } catch (error) {
    return handleApiError(error);
  }
}
