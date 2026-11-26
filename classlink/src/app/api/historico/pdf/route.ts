import { NextRequest, NextResponse } from "next/server";
import { handleApiError } from "@/lib/http";
import { nomeArquivoHistorico, pedidoPdfHistoricoSchema } from "@/lib/historico-escolar";
import { gerarHistoricoPdf } from "@/lib/historico-pdf";
import { alunoDaEscola, exigirQuemEmiteHistorico, validar } from "@/lib/historico-server";

/**
 * PDF do histórico escolar com o que está na tela (direção, secretaria e coordenação). O aluno
 * precisa ser desta escola. Nada é gravado aqui: salvar é outro botão.
 */
export async function POST(request: NextRequest) {
  try {
    const session = await exigirQuemEmiteHistorico();
    const { modelo, historico } = validar(pedidoPdfHistoricoSchema, await request.json());
    await alunoDaEscola(session.schoolId, historico.studentId);
    const pdf = await gerarHistoricoPdf(modelo, historico);
    return new NextResponse(new Blob([Uint8Array.from(pdf)]), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${nomeArquivoHistorico(historico.aluno.nome)}"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}
