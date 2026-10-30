"use client";

import imageCompression from "browser-image-compression";
import { uploadPresigned } from "@vercel/blob/client";
import { apiJson } from "@/lib/api-client";
import { ANEXO_LIMITE_ENVIO_SERVIDOR, TIPOS_ANEXO, problemaNoAnexo } from "@/lib/anexo-envio";

/** Tipo pelo nome, quando o celular não informa (acontece com alguns gerenciadores de arquivo). */
function tipoDoArquivo(arquivo: File): string {
  if (arquivo.type) return arquivo.type;
  const ext = arquivo.name.split(".").pop()?.toLowerCase();
  return ext === "pdf" ? "application/pdf" : ext === "png" ? "image/png" : ext === "webp" ? "image/webp" : "image/jpeg";
}

/**
 * Foto de documento: reduz no navegador (economiza dados e cabe no envio rápido), mas mantém
 * resolução suficiente para ler o texto. PDF vai como está.
 */
async function prepararArquivo(arquivo: File): Promise<File> {
  const tipo = tipoDoArquivo(arquivo);
  if (!tipo.startsWith("image/") || arquivo.size <= 1.5 * 1024 * 1024) return arquivo;
  const reduzida = await imageCompression(arquivo, {
    maxSizeMB: 2,
    maxWidthOrHeight: 2560,
    // Sem web worker: no modo worker a biblioteca baixa código de um CDN externo (bloqueado pela CSP).
    useWebWorker: false,
    fileType: tipo,
  }).catch(() => arquivo);
  return new File([reduzida], arquivo.name, { type: tipo });
}

/**
 * Envia uma mensagem com arquivo na conversa com a família/direção. Até 4 MB vai junto com a
 * mensagem; acima disso, o arquivo vai direto ao armazenamento privado (link de envio autorizado
 * pelo servidor) e o servidor confere antes de gravar a mensagem.
 */
export async function enviarMensagemComArquivo<T>(opcoes: {
  conversaId: string;
  escolaId: string;
  texto: string;
  canal?: string;
  arquivo: File;
  aoProgredir?: (pct: number) => void;
}): Promise<T> {
  const { conversaId, escolaId, texto, canal, aoProgredir } = opcoes;
  const problema = problemaNoAnexo(opcoes.arquivo);
  if (problema) throw new Error(problema);
  const arquivo = await prepararArquivo(opcoes.arquivo);
  const rota = `/api/messages/conversations/${conversaId}`;

  if (arquivo.size <= ANEXO_LIMITE_ENVIO_SERVIDOR) {
    const form = new FormData();
    form.append("body", texto);
    if (canal) form.append("channel", canal);
    form.append("file", arquivo, arquivo.name);
    return apiJson<T>(rota, { method: "POST", body: form });
  }

  const tipo = tipoDoArquivo(arquivo);
  const ext = TIPOS_ANEXO[tipo];
  if (!ext) throw new Error(problema ?? "Tipo de arquivo não suportado.");
  const caminho = `classlink/${escolaId}/mensagens/${conversaId}/${crypto.randomUUID()}.${ext}`;
  aoProgredir?.(0);
  try {
    await uploadPresigned(caminho, arquivo, {
      access: "private",
      handleUploadUrl: `${rota}/anexo`,
      contentType: tipo,
      multipart: arquivo.size > 10 * 1024 * 1024,
      onUploadProgress: aoProgredir ? (p) => aoProgredir(Math.round(p.percentage)) : undefined,
    });
  } catch (err) {
    console.error("mensagens: falha no envio direto do arquivo", err);
    throw new Error("Não foi possível enviar o arquivo. Verifique a internet e tente de novo.");
  }
  return apiJson<T>(rota, {
    method: "POST",
    body: JSON.stringify({ body: texto, channel: canal, anexo: { path: caminho, nome: arquivo.name } }),
  });
}
