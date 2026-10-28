import { NextRequest, NextResponse } from "next/server";
import { issueSignedToken } from "@vercel/blob";
import { handleUploadPresigned, type HandleUploadPresignedBody } from "@vercel/blob/client";
import { requireRole } from "@/lib/session";
import { handleApiError } from "@/lib/http";
import { ErroDeUsuario } from "@/lib/erros";
import { isBlobConfigured } from "@/lib/blob-storage";
import { CONTRATO_MAX_BYTES, caminhoContratoValido, podeEnviarAssinado } from "@/lib/contratos";
import { carregarContratoComAcesso } from "@/lib/contratos-server";

/**
 * Contrato assinado acima de 4 MB: autoriza o navegador do responsável a enviar o PDF direto
 * para o Vercel Blob privado (as funções da Vercel recusam corpos acima de ~4,5 MB). O link
 * de envio vale 15 minutos, só para um caminho deste contrato, só PDF e até 20 MB. Depois do
 * envio, POST /api/contratos/[id]/assinado confere o conteúdo e registra o envio.
 */
export async function POST(request: NextRequest, ctx: RouteContext<"/api/contratos/[id]/assinado/envio">) {
  try {
    const session = await requireRole("GUARDIAN");
    const { id } = await ctx.params;

    const contrato = await carregarContratoComAcesso(id, session);
    if (!contrato) return NextResponse.json({ error: "Contrato não encontrado" }, { status: 404 });
    if (!podeEnviarAssinado(contrato.status)) throw new ErroDeUsuario("Este contrato não está aguardando envio da família.", 409);
    if (!isBlobConfigured()) {
      throw new ErroDeUsuario("Arquivos acima de 4 MB ainda não podem ser recebidos. Fale com a secretaria da escola.", 400);
    }

    const body = (await request.json()) as HandleUploadPresignedBody;
    const tipos = ["application/pdf"];
    const resultado = await handleUploadPresigned({
      body,
      request,
      getSignedToken: async (pathname) => {
        if (!caminhoContratoValido(pathname, session.schoolId, id)) throw new ErroDeUsuario("Caminho de arquivo inválido.", 400);
        const validUntil = Date.now() + 15 * 60 * 1000;
        const token = await issueSignedToken({ pathname, operations: ["put"], allowedContentTypes: tipos, maximumSizeInBytes: CONTRATO_MAX_BYTES, validUntil });
        return { token, urlOptions: { allowedContentTypes: tipos, maximumSizeInBytes: CONTRATO_MAX_BYTES, validUntil, addRandomSuffix: false } };
      },
    });
    return NextResponse.json(resultado);
  } catch (error) {
    return handleApiError(error);
  }
}
