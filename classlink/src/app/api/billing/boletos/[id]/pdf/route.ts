import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { handleApiError } from "@/lib/http";
import { baixarPdfCobranca } from "@/lib/banco-inter";

/** Baixa o PDF do boleto sob demanda direto da API do Inter — não guardamos o PDF em repouso. */
export async function GET(_request: NextRequest, ctx: RouteContext<"/api/billing/boletos/[id]/pdf">) {
  try {
    const session = await requireRole("GUARDIAN", "ADMIN");
    const { id } = await ctx.params;

    const boleto = await prisma.boleto.findFirst({ where: { id, schoolId: session.schoolId } });
    if (!boleto || !boleto.codigoSolicitacao) {
      return NextResponse.json({ error: "Boleto não encontrado" }, { status: 404 });
    }

    if (session.role === "GUARDIAN") {
      const vinculo = await prisma.guardianStudent.findUnique({
        where: { guardianId_studentId: { guardianId: session.sub, studentId: boleto.studentId } },
      });
      if (!vinculo) return NextResponse.json({ error: "Boleto não encontrado" }, { status: 404 });
    }

    const pdf = await baixarPdfCobranca(boleto.codigoSolicitacao);
    return new NextResponse(new Blob([Uint8Array.from(pdf)]), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="boleto-${boleto.mesReferencia}.pdf"`,
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}
