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

/** Junta os pedaços lidos de um fluxo num único Uint8Array. */
export function juntarPartes(partes: Uint8Array[], total = partes.reduce((s, p) => s + p.length, 0)): Uint8Array<ArrayBuffer> {
  const junto = new Uint8Array(total);
  let pos = 0;
  for (const p of partes) {
    junto.set(p, pos);
    pos += p.length;
  }
  return junto;
}

/**
 * Primeiros `bytes` de um arquivo do Blob e o tamanho total, sem baixar o arquivo inteiro
 * (para conferir o tipo real pelo conteúdo). Null quando o arquivo não existe.
 */
export async function inicioDoBlob(caminho: string, bytes = 64): Promise<{ inicio: Uint8Array; tamanho: number } | null> {
  const arquivo = await lerDoBlob(caminho);
  if (!arquivo || arquivo.statusCode !== 200) return null;
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
  return { inicio: juntarPartes(partes, total).slice(0, bytes), tamanho: arquivo.blob.size };
}
