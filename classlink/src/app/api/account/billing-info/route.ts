import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { handleApiError } from "@/lib/http";
import { setBillingInfoSchema } from "@/lib/validators";

/** Dados de cobrança (CPF + endereço) que o próprio responsável cadastra para permitir emissão de boleto. */
export async function GET() {
  try {
    const session = await requireRole("GUARDIAN");
    const user = await prisma.user.findUniqueOrThrow({
      where: { id: session.sub },
      select: { cpf: true, enderecoCobranca: true },
    });
    return NextResponse.json(user);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PUT(request: NextRequest) {
  try {
    const session = await requireRole("GUARDIAN");
    const body = setBillingInfoSchema.parse(await request.json());

    await prisma.user.update({
      where: { id: session.sub },
      data: { cpf: body.cpf, enderecoCobranca: body.endereco },
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
}
