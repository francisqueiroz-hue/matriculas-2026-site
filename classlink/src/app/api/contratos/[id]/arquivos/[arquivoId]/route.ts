import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { handleApiError } from "@/lib/http";
import { nomeArquivoPdfSeguro } from "@/lib/contratos";
import { carregarContratoComAcesso } from "@/lib/contratos-server";

/**
 * Entrega o PDF (modelo ou assinado) só para quem tem acesso ao contrato. Nunca há link
 * público: cada download passa por esta rota e confere sessão e vínculo na hora.
 * `?download=1` força o download; sem ele o PDF abre no navegador.
 */
export async function GET(request: NextRequest, ctx: RouteContext<"/api/contratos/[id]/arquivos/[arquivoId]">) {
  try {
    const session = await requireRole("GUARDIAN", "ADMIN");
    const { id, arquivoId } = await ctx.params;

    const contrato = await carregarContratoComAcesso(id, session);
    if (!contrato) return NextResponse.json({ error: "Arquivo não encontrado" }, { status: 404 });

    const arquivo = await prisma.contratoArquivo.findFirst({
      where: { id: arquivoId, contratoId: id },
      select: { nomeArquivo: true, conteudo: true },
    });
    if (!arquivo) return NextResponse.json({ error: "Arquivo não encontrado" }, { status: 404 });

    // Quem tem acesso ao contrato vê todos os arquivos dele (modelo e envios dos
    // responsáveis do mesmo aluno) — nunca arquivos de outro contrato.
    const disposicao = request.nextUrl.searchParams.get("download") === "1" ? "attachment" : "inline";
    const nome = nomeArquivoPdfSeguro(arquivo.nomeArquivo);

    return new NextResponse(new Blob([Uint8Array.from(arquivo.conteudo)]), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `${disposicao}; filename="${nome.replace(/[^\x20-\x7e]/g, "_")}"; filename*=UTF-8''${encodeURIComponent(nome)}`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}
