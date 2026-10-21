"use client";

import imageCompression from "browser-image-compression";
import { uploadPresigned } from "@vercel/blob/client";
import { apiJson } from "@/lib/api-client";
import { LIMITE_ENVIO_PELO_SERVIDOR, MAX_ENVIO_DIRETO, TIPOS_ENVIO_DIRETO } from "@/lib/upload-direto";

type Enviado = { url: string; path: string; mediaType: "image" | "video" };

/**
 * Arquivo grande (vídeo, normalmente): vai direto do navegador para o Vercel Blob privado,
 * com link de envio autorizado pelo servidor; depois o servidor confere o conteúdo real.
 */
async function enviarDireto(arquivo: File, escolaId: string, aoProgredir?: (pct: number) => void): Promise<Enviado> {
  const ext = TIPOS_ENVIO_DIRETO[arquivo.type];
  if (!ext) throw new Error("Tipo de arquivo não suportado.");
  if (arquivo.size > MAX_ENVIO_DIRETO) throw new Error(`Arquivo muito grande. Limite de ${MAX_ENVIO_DIRETO / 1024 / 1024} MB.`);
  const caminho = `classlink/${escolaId}/${crypto.randomUUID()}.${ext}`;
  await uploadPresigned(caminho, arquivo, {
    access: "private",
    handleUploadUrl: "/api/upload/direto",
    contentType: arquivo.type,
    multipart: arquivo.size > 10 * 1024 * 1024,
    onUploadProgress: aoProgredir ? (p) => aoProgredir(Math.round(p.percentage)) : undefined,
  });
  return apiJson<Enviado>("/api/upload/confirmar", { method: "POST", body: JSON.stringify({ path: caminho }) });
}

/** Comprime imagens no navegador antes do upload (economiza banda e armazenamento). Vídeos vão sem compressão. */
export async function uploadMediaFile(
  file: File,
  opcoes: { escolaId?: string; aoProgredir?: (pct: number) => void } = {},
): Promise<Enviado> {
  let toUpload: File = file;

  if (file.type.startsWith("image/")) {
    toUpload = await imageCompression(file, {
      maxSizeMB: 1.5,
      maxWidthOrHeight: 1920,
      // Sem web worker: no modo worker a biblioteca baixa o próprio código de um CDN externo
      // (cdn.jsdelivr.net) — dependência de terceiros e bloqueado pela CSP. Uma imagem por
      // vez comprime rápido na própria página.
      useWebWorker: false,
      fileType: file.type,
    });
  }

  // A Vercel recusa corpos acima de ~4,5 MB nas funções: arquivos maiores vão direto ao Blob.
  if (toUpload.size > LIMITE_ENVIO_PELO_SERVIDOR) {
    if (!opcoes.escolaId) throw new Error("Arquivo muito grande para envio.");
    return enviarDireto(toUpload, opcoes.escolaId, opcoes.aoProgredir);
  }

  const formData = new FormData();
  formData.append("file", toUpload, file.name);

  return apiJson<Enviado>("/api/upload", {
    method: "POST",
    body: formData,
  });
}
