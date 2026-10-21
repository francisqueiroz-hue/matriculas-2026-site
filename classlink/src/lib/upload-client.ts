"use client";

import imageCompression from "browser-image-compression";
import { apiJson } from "@/lib/api-client";

/** Comprime imagens no navegador antes do upload (economiza banda e armazenamento). Vídeos vão sem compressão. */
export async function uploadMediaFile(file: File): Promise<{ url: string; path: string; mediaType: "image" | "video" }> {
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

  const formData = new FormData();
  formData.append("file", toUpload, file.name);

  return apiJson<{ url: string; path: string; mediaType: "image" | "video" }>("/api/upload", {
    method: "POST",
    body: formData,
  });
}
