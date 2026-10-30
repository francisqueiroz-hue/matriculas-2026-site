import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { handleApiError } from "@/lib/http";
import { setBillingConfigSchema } from "@/lib/validators";
import { DIA_VENCIMENTO_PADRAO } from "@/lib/billing";

export async function GET() {
  try {
    const session = await requireRole("ADMIN");
    const school = await prisma.school.findUniqueOrThrow({
      where: { id: session.schoolId },
      select: { diaVencimentoPadrao: true, diaEmissaoBoletos: true },
    });
    return NextResponse.json(school);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PUT(request: NextRequest) {
  try {
    const session = await requireRole("ADMIN");
    const body = setBillingConfigSchema.parse(await request.json());

    const school = await prisma.school.update({
      where: { id: session.schoolId },
      // O vencimento padrão é sempre dia 05; só o dia de emissão é configurável.
      data: { ...body, diaVencimentoPadrao: DIA_VENCIMENTO_PADRAO },
      select: { diaVencimentoPadrao: true, diaEmissaoBoletos: true },
    });

    return NextResponse.json(school);
  } catch (error) {
    return handleApiError(error);
  }
}
