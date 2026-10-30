import { NextRequest, NextResponse } from "next/server";
import { issueSignedToken } from "@vercel/blob";
import { handleUploadPresigned, type HandleUploadPresignedBody } from "@vercel/blob/client";
import { requireSession } from "@/lib/session";
import { handleApiError } from "@/lib/http";
import { ErroDeUsuario } from "@/lib/erros";
import { isBlobConfigured } from "@/lib/blob-storage";
import { assertConversationParticipant } from "@/lib/messaging";
import { exigirPodeConversar } from "@/lib/permissoes-mensagens";
import { ANEXO_MAX_BYTES, TIPOS_ANEXO, caminhoAnexoValido } from "@/lib/anexo-envio";

/**
 * Arquivo acima de 4 MB na aba Mensagens: autoriza o navegador de quem participa da conversa
 * (família ou direção/coordenação) a enviar direto para o Vercel Blob privado. O link de envio
 * vale 15 minutos, só para um caminho desta conversa, só PDF/foto e até 20 MB. Depois, o POST
 * da conversa confere o conteúdo e grava a mensagem.
 */
export async function POST(request: NextRequest, ctx: RouteContext<"/api/messages/conversations/[id]/anexo">) {
  try {
    const session = await requireSession();
    const { id } = await ctx.params;
    const conversa = await assertConversationParticipant(id, session.sub);
    await exigirPodeConversar(conversa.staffId, conversa.guardianId);
    if (!isBlobConfigured()) {
      throw new ErroDeUsuario("Arquivos acima de 4 MB ainda não podem ser recebidos. Envie um arquivo menor ou fale com a secretaria.", 400);
    }

    const body = (await request.json()) as HandleUploadPresignedBody;
    const tipos = Object.keys(TIPOS_ANEXO);
    const resultado = await handleUploadPresigned({
      body,
      request,
      getSignedToken: async (pathname) => {
        if (!caminhoAnexoValido(pathname, session.schoolId, id)) throw new ErroDeUsuario("Caminho de arquivo inválido.", 400);
        const validUntil = Date.now() + 15 * 60 * 1000;
        const token = await issueSignedToken({ pathname, operations: ["put"], allowedContentTypes: tipos, maximumSizeInBytes: ANEXO_MAX_BYTES, validUntil });
        return { token, urlOptions: { allowedContentTypes: tipos, maximumSizeInBytes: ANEXO_MAX_BYTES, validUntil, addRandomSuffix: false } };
      },
    });
    return NextResponse.json(resultado);
  } catch (error) {
    return handleApiError(error);
  }
}
