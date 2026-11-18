import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { exigirDirecaoOuCoordenacao, requireRole } from "@/lib/session";
import { handleApiError } from "@/lib/http";
import { MENSAGEM_SO_DIRECAO_COORDENACAO_BOLETIM } from "@/lib/equipe";
import { exigirArea } from "@/lib/visibilidade-server";
import { modeloBoletimSchema } from "@/lib/boletim-modelo";
import { carregarModeloBoletim } from "@/lib/boletim-pdf-server";

async function exigirQuemImprime() {
  const session = await requireRole("ADMIN", "STAFF");
  await exigirArea(session, "NOTAS");
  await exigirDirecaoOuCoordenacao(session, MENSAGEM_SO_DIRECAO_COORDENACAO_BOLETIM);
  return session;
}

/** Modelo do boletim impresso da escola (cabeçalho, rodapé, cidade, quem assina). */
export async function GET() {
  try {
    const session = await exigirQuemImprime();
    return NextResponse.json({ modelo: await carregarModeloBoletim(session.schoolId) });
  } catch (error) {
    return handleApiError(error);
  }
}

/** Salva o modelo para os próximos boletins (direção ou coordenação). Não mexe nas notas. */
export async function PUT(request: NextRequest) {
  try {
    const session = await exigirQuemImprime();
    const modelo = modeloBoletimSchema.parse(await request.json());
    await prisma.boletimModelo.upsert({
      where: { schoolId: session.schoolId },
      create: { schoolId: session.schoolId, dados: modelo, editadoPorId: session.sub },
      update: { dados: modelo, editadoPorId: session.sub },
    });
    return NextResponse.json({ modelo });
  } catch (error) {
    return handleApiError(error);
  }
}
