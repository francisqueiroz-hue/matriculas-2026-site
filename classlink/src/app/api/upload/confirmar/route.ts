import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireRole } from "@/lib/session";
import { handleApiError } from "@/lib/http";
import { ErroDeUsuario } from "@/lib/erros";
import { apagarDoBlob, lerDoBlob } from "@/lib/blob-storage";
import { getSignedMediaUrl } from "@/lib/firebase-storage";
import { detectarTipoMidia } from "@/lib/tipo-midia";
import { caminhoDiretoValido } from "@/lib/upload-direto";

const schema = z.object({ path: z.string().min(1).max(300) });

/** Lê os primeiros bytes do Blob (sem baixar o arquivo inteiro). */
async function inicioDoArquivo(caminho: string, bytes = 64): Promise<Uint8Array> {
  const arquivo = await lerDoBlob(caminho);
  if (!arquivo || arquivo.statusCode !== 200) throw new ErroDeUsuario("Arquivo não encontrado no armazenamento.", 404);
  const leitor = arquivo.stream.getReader();
  const partes: Uint8Array[] = [];
  let total = 0;
  while (total < bytes) {
    const { value, done } = await leitor.read();
    if (done || !value) break;
    partes.push(value);
    total += value.length;
  }
  await leitor.cancel().catch(() => undefined);
  const junto = new Uint8Array(total);
  let pos = 0;
  for (const p of partes) {
    junto.set(p, pos);
    pos += p.length;
  }
  return junto.slice(0, bytes);
}

/**
 * Depois do envio direto: confere pelo conteúdo real (não pelo tipo informado pelo navegador)
 * que é imagem/vídeo aceito; se não for, apaga. Devolve o link de exibição.
 */
export async function POST(request: NextRequest) {
  try {
    const session = await requireRole("ADMIN", "STAFF");
    const { path } = schema.parse(await request.json());
    if (!caminhoDiretoValido(path, session.schoolId)) throw new ErroDeUsuario("Caminho de arquivo inválido.", 400);

    const real = detectarTipoMidia(await inicioDoArquivo(path));
    if (!real || !path.endsWith(`.${real.extensao}`)) {
      await apagarDoBlob(path).catch(() => undefined);
      throw new ErroDeUsuario("O conteúdo do arquivo não corresponde a uma imagem ou vídeo suportado.", 415);
    }
    return NextResponse.json({ url: await getSignedMediaUrl(path), path, mediaType: real.kind });
  } catch (error) {
    return handleApiError(error);
  }
}
