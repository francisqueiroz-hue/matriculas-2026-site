import { NextRequest, NextResponse } from "next/server";
import { issueSignedToken } from "@vercel/blob";
import { handleUploadPresigned, type HandleUploadPresignedBody } from "@vercel/blob/client";
import { requireRole } from "@/lib/session";
import { handleApiError } from "@/lib/http";
import { ErroDeUsuario } from "@/lib/erros";
import { provedorDeMidia } from "@/lib/firebase-storage";
import { MAX_ENVIO_DIRETO, TIPOS_ENVIO_DIRETO, caminhoDiretoValido } from "@/lib/upload-direto";

/**
 * Autoriza o navegador a enviar um arquivo grande direto para o Vercel Blob: devolve um link
 * de envio pré-assinado, válido por 15 minutos, só para aquele caminho da escola da sessão,
 * com os tipos e o tamanho máximo do app. Só a equipe (direção/STAFF).
 */
export async function POST(request: NextRequest) {
  try {
    const session = await requireRole("ADMIN", "STAFF");
    if (provedorDeMidia() !== "blob") {
      throw new ErroDeUsuario("Arquivos acima de 4 MB precisam do armazenamento Vercel Blob conectado ao projeto.", 400);
    }
    const body = (await request.json()) as HandleUploadPresignedBody;
    const tipos = Object.keys(TIPOS_ENVIO_DIRETO);
    const resultado = await handleUploadPresigned({
      body,
      request,
      getSignedToken: async (pathname) => {
        if (!caminhoDiretoValido(pathname, session.schoolId)) throw new ErroDeUsuario("Caminho de arquivo inválido.", 400);
        const validUntil = Date.now() + 15 * 60 * 1000;
        const token = await issueSignedToken({ pathname, operations: ["put"], allowedContentTypes: tipos, maximumSizeInBytes: MAX_ENVIO_DIRETO, validUntil });
        return { token, urlOptions: { allowedContentTypes: tipos, maximumSizeInBytes: MAX_ENVIO_DIRETO, validUntil, addRandomSuffix: false } };
      },
    });
    return NextResponse.json(resultado);
  } catch (error) {
    return handleApiError(error);
  }
}
