import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { handleApiError } from "@/lib/http";
import { cargoParaExibir } from "@/lib/permissoes-mensagens";
import { SELECT_PESSOA, nomeInstitucional } from "@/lib/nome-institucional";

/** Como a pessoa da equipe aparece para as famílias (mensagens, Mural, comunicados). */
export async function GET() {
  try {
    const session = await requireRole("ADMIN", "STAFF");
    const eu = await prisma.user.findUniqueOrThrow({ where: { id: session.sub }, select: SELECT_PESSOA });
    return NextResponse.json({ nomeParaFamilias: eu.nomeParaFamilias, cargo: cargoParaExibir(eu), exibido: nomeInstitucional(eu) });
  } catch (error) {
    return handleApiError(error);
  }
}

const schema = z.object({ nomeParaFamilias: z.string().trim().max(60).nullable() });

export async function PATCH(request: NextRequest) {
  try {
    const session = await requireRole("ADMIN", "STAFF");
    const { nomeParaFamilias } = schema.parse(await request.json());
    const eu = await prisma.user.update({
      where: { id: session.sub },
      data: { nomeParaFamilias: nomeParaFamilias || null },
      select: SELECT_PESSOA,
    });
    return NextResponse.json({ nomeParaFamilias: eu.nomeParaFamilias, cargo: cargoParaExibir(eu), exibido: nomeInstitucional(eu) });
  } catch (error) {
    return handleApiError(error);
  }
}
