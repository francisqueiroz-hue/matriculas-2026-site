import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireRole } from "@/lib/session";
import { handleApiError } from "@/lib/http";
import { ErroDeUsuario } from "@/lib/erros";
import { apagarDoBlob, inicioDoBlob } from "@/lib/blob-storage";
import { getSignedMediaUrl } from "@/lib/firebase-storage";
import { detectarTipoMidia } from "@/lib/tipo-midia";
import { caminhoDiretoValido } from "@/lib/upload-direto";

const schema = z.object({ path: z.string().min(1).max(300) });

/**
 * Depois do envio direto: confere pelo conteúdo real (não pelo tipo informado pelo navegador)
 * que é imagem/vídeo aceito; se não for, apaga. Devolve o link de exibição.
 */
export async function POST(request: NextRequest) {
  try {
    const session = await requireRole("ADMIN", "STAFF");
    const { path } = schema.parse(await request.json());
    if (!caminhoDiretoValido(path, session.schoolId)) throw new ErroDeUsuario("Caminho de arquivo inválido.", 400);

    const lido = await inicioDoBlob(path);
    if (!lido) throw new ErroDeUsuario("Arquivo não encontrado no armazenamento.", 404);
    const real = detectarTipoMidia(lido.inicio);
    if (!real || !path.endsWith(`.${real.extensao}`)) {
      await apagarDoBlob(path).catch(() => undefined);
      throw new ErroDeUsuario("O conteúdo do arquivo não corresponde a uma imagem ou vídeo suportado.", 415);
    }
    return NextResponse.json({ url: await getSignedMediaUrl(path), path, mediaType: real.kind });
  } catch (error) {
    return handleApiError(error);
  }
}
