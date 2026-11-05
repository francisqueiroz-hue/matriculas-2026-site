import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { handleApiError } from "@/lib/http";
import { CONTRATO_MAX_BYTES, ContratoErro } from "@/lib/contratos";
import { lerPdfDoBlob } from "@/lib/contratos-server";
import { conferirAssinaturasPdf, normalizarNome } from "@/lib/assinatura-pdf";

/**
 * Pré-conferência da assinatura digital do PDF que a família enviou (só direção/secretaria).
 * Lê o arquivo guardado (banco ou Blob privado), sem alterar nada, e devolve quem assinou,
 * se o PDF está íntegro e se o nome bate com algum responsável cadastrado do aluno.
 * A validação oficial (cadeia gov.br/ICP-Brasil e revogação) continua no validar.iti.gov.br.
 */
export async function GET(request: NextRequest, ctx: RouteContext<"/api/admin/contratos/[id]/assinatura">) {
  try {
    const session = await requireRole("ADMIN");
    const { id } = await ctx.params;
    const arquivoId = request.nextUrl.searchParams.get("arquivoId");
    if (!arquivoId) return NextResponse.json({ error: "Informe o arquivo" }, { status: 400 });

    const contrato = await prisma.contrato.findFirst({
      where: { id, schoolId: session.schoolId, student: { deletedAt: null } },
      select: { id: true, student: { select: { guardians: { select: { guardian: { select: { name: true } } } } } } },
    });
    if (!contrato) return NextResponse.json({ error: "Contrato não encontrado" }, { status: 404 });

    const arquivo = await prisma.contratoArquivo.findFirst({
      where: { id: arquivoId, contratoId: id, tipo: "ASSINADO" },
      select: { conteudo: true, blobPath: true },
    });
    if (!arquivo) return NextResponse.json({ error: "Arquivo não encontrado" }, { status: 404 });

    let bytes: Uint8Array | null = null;
    if (arquivo.blobPath) {
      try {
        bytes = await lerPdfDoBlob(arquivo.blobPath, CONTRATO_MAX_BYTES);
      } catch (e) {
        if (!(e instanceof ContratoErro)) throw e;
        return NextResponse.json({ error: e.message }, { status: 400 });
      }
    } else if (arquivo.conteudo) {
      bytes = Uint8Array.from(arquivo.conteudo);
    }
    if (!bytes) return NextResponse.json({ error: "Arquivo não encontrado no armazenamento" }, { status: 404 });

    const resultado = conferirAssinaturasPdf(bytes);
    const responsaveis = contrato.student.guardians.map((g) => g.guardian.name);
    const assinaturas = resultado.assinaturas.map((a) => {
      const nome = a.signatario ? normalizarNome(a.signatario) : "";
      const responsavel = nome ? (responsaveis.find((r) => normalizarNome(r) === nome) ?? null) : null;
      return { ...a, responsavelCadastrado: responsavel };
    });

    return NextResponse.json(
      { ...resultado, assinaturas },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    return handleApiError(error);
  }
}
