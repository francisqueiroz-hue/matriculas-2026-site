import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { handleApiError } from "@/lib/http";
import { CAMPANHA_REMATRICULA } from "@/lib/rematricula";
import { carregarConfig } from "@/lib/contrato-modelo/servidor";
import { configContratoSchema } from "@/lib/contrato-modelo/validacao";
import { pendenciasConfig } from "@/lib/contrato-modelo/tipos";

function anoDa(request: NextRequest) {
  const ano = Number(request.nextUrl.searchParams.get("ano"));
  return Number.isInteger(ano) && ano >= 2020 && ano <= 2100 ? ano : CAMPANHA_REMATRICULA.ano;
}

/** Configuração do contrato do ano (valores, parcelas, hora excedente, dados da escola). */
export async function GET(request: NextRequest) {
  try {
    const session = await requireRole("ADMIN");
    const anoLetivo = anoDa(request);
    const { config, salva, atualizadaEm } = await carregarConfig(session.schoolId, anoLetivo);
    return NextResponse.json({ anoLetivo, config, salva, atualizadaEm, pendencias: pendenciasConfig(config) });
  } catch (error) {
    return handleApiError(error);
  }
}

/** Salva a configuração (pode ficar incompleta; o envio é que exige tudo preenchido). */
export async function PUT(request: NextRequest) {
  try {
    const session = await requireRole("ADMIN");
    const anoLetivo = anoDa(request);
    const config = configContratoSchema.parse(await request.json());
    await prisma.contratoConfig.upsert({
      where: { schoolId_anoLetivo: { schoolId: session.schoolId, anoLetivo } },
      create: { schoolId: session.schoolId, anoLetivo, dados: config, editadoPorId: session.sub },
      update: { dados: config, editadoPorId: session.sub },
    });
    return NextResponse.json({ anoLetivo, config, pendencias: pendenciasConfig(config) });
  } catch (error) {
    return handleApiError(error);
  }
}
