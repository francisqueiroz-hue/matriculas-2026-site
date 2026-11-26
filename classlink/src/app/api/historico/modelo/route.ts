import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { handleApiError } from "@/lib/http";
import { modeloHistoricoSchema } from "@/lib/historico-escolar";
import { exigirQuemEmiteHistorico, validar } from "@/lib/historico-server";

/**
 * Salva o modelo do histórico para os próximos (cabeçalho, título, cidade, escola, quem assina,
 * componentes e anos padrão). Só direção e coordenação. Não mexe em históricos salvos.
 */
export async function PUT(request: NextRequest) {
  try {
    const session = await exigirQuemEmiteHistorico();
    const modelo = validar(modeloHistoricoSchema, await request.json());
    await prisma.historicoModelo.upsert({
      where: { schoolId: session.schoolId },
      create: { schoolId: session.schoolId, dados: modelo, editadoPorId: session.sub },
      update: { dados: modelo, editadoPorId: session.sub },
    });
    return NextResponse.json({ modelo });
  } catch (error) {
    return handleApiError(error);
  }
}
