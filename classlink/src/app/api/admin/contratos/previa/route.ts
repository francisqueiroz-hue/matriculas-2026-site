import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/session";
import { handleApiError } from "@/lib/http";
import { CAMPANHA_REMATRICULA } from "@/lib/rematricula";
import { carregarConfig } from "@/lib/contrato-modelo/servidor";
import { gerarContrato2027 } from "@/lib/contrato-modelo/gerar";
import { MODELO_CONTRATO_2027 } from "@/lib/contrato-modelo/tipos";

/**
 * Prévia do contrato exatamente como a família recebe (em branco para preencher à mão), com a
 * configuração salva e um aluno de exemplo. Não grava nada.
 */
export async function GET(request: NextRequest) {
  try {
    const session = await requireRole("ADMIN");
    const anoLetivo = Number(request.nextUrl.searchParams.get("ano")) || CAMPANHA_REMATRICULA.ano;
    const { config } = await carregarConfig(session.schoolId, anoLetivo);
    const pdf = await gerarContrato2027({
      condicoes: { modelo: MODELO_CONTRATO_2027, anoLetivo, etapa: "EI", turma: "Turma (exemplo)", periodo: null, parcelaBruta: 0, parcelaLiquida: 0, config },
      familia: null,
      aluno: { nome: "Nome do Aluno (exemplo)" },
      data: null,
    });
    return new NextResponse(new Blob([Uint8Array.from(pdf)]), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="previa-contrato-${anoLetivo}.pdf"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}
