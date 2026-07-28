import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { handleApiError } from "@/lib/http";
import { setBillingConfigSchema } from "@/lib/validators";

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
      data: body,
      select: { diaVencimentoPadrao: true, diaEmissaoBoletos: true },
    });

    return NextResponse.json(school);
  } catch (error) {
    return handleApiError(error);
  }
}
