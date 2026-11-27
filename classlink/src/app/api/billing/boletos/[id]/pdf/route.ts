import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { exigirDirecaoSeAdmin, requireRole } from "@/lib/session";
import { handleApiError } from "@/lib/http";
import { baixarPdfCobranca } from "@/lib/banco-inter";
import { exigirArea } from "@/lib/visibilidade-server";
import { responsavelVeItem } from "@/lib/responsavel-financeiro";
import { escolaEhDemonstracao, MENSAGEM_BOLETO_DEMONSTRACAO } from "@/lib/escola-demonstracao";
import { ErroDeUsuario } from "@/lib/erros";

/** Baixa o PDF do boleto sob demanda direto da API do Inter — não guardamos o PDF em repouso. */
export async function GET(_request: NextRequest, ctx: RouteContext<"/api/billing/boletos/[id]/pdf">) {
  try {
    const session = await requireRole("GUARDIAN", "ADMIN");
    await exigirArea(session, "FINANCEIRO");
    // Da administração, só a direção vê contratos e boletos (valores).
    await exigirDirecaoSeAdmin(session);
    const { id } = await ctx.params;

    const boleto = await prisma.boleto.findFirst({ where: { id, schoolId: session.schoolId } });
    if (!boleto || !boleto.codigoSolicitacao) {
      return NextResponse.json({ error: "Boleto não encontrado" }, { status: 404 });
    }

    if (session.role === "GUARDIAN") {
      const vinculo = await prisma.guardianStudent.findUnique({
        where: { guardianId_studentId: { guardianId: session.sub, studentId: boleto.studentId } },
      });
      if (!responsavelVeItem(boleto, !!vinculo, session.sub)) return NextResponse.json({ error: "Boleto não encontrado" }, { status: 404 });
    }

    // Conta de demonstração: o boleto é fictício e nunca existiu no Inter.
    if (await escolaEhDemonstracao(session.schoolId)) {
      return NextResponse.json({ error: MENSAGEM_BOLETO_DEMONSTRACAO }, { status: 404 });
    }

    let pdf: Buffer;
    try {
      pdf = await baixarPdfCobranca(boleto.codigoSolicitacao);
    } catch (err) {
      console.warn("inter: PDF do boleto indisponível", boleto.id, err instanceof Error ? err.message : err);
      // Logo após a emissão o banco ainda está gerando o título: mensagem clara em vez de erro genérico.
      throw new ErroDeUsuario(
        boleto.linhaDigitavel
          ? "O Banco Inter não entregou o PDF agora. Tente de novo em alguns minutos ou use o Pix ou a linha digitável."
          : "O banco ainda está gerando este boleto. Tente de novo em alguns minutos.",
        503,
      );
    }
    return new NextResponse(new Blob([Uint8Array.from(pdf)]), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="boleto-${boleto.mesReferencia}.pdf"`,
        // Dados pessoais e financeiros da família: nada de cache no aparelho ou no caminho.
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}
