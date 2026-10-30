import { del, get, put } from "@vercel/blob";
import { linkAssinado } from "@/lib/midia-assinada";

/**
 * Armazenamento de mídia no Vercel Blob, em modo PRIVADO (fotos de alunos: LGPD). Usado no
 * lugar do Firebase Storage quando o projeto tem um Blob store conectado — a Vercel cria a
 * variável BLOB_READ_WRITE_TOKEN ao conectar. A leitura passa sempre pelo servidor
 * (/api/midia), com link assinado e temporário.
 */
export function isBlobConfigured(): boolean {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN?.trim() || process.env.BLOB_STORE_ID?.trim());
}

export async function salvarNoBlob(caminho: string, conteudo: Buffer, contentType: string): Promise<void> {
  await put(caminho, conteudo, { access: "private", contentType, addRandomSuffix: false });
}

export function linkDoBlob(caminho: string, validadeMs: number): string {
  return linkAssinado(caminho, validadeMs);
}

export async function lerDoBlob(caminho: string) {
  return get(caminho, { access: "private" });
}

export async function apagarDoBlob(caminho: string | string[]): Promise<void> {
  await del(caminho);
}
