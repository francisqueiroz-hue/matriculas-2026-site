import { randomUUID } from "node:crypto";
import { guardarArquivo } from "@/lib/firebase-storage";
import { detectarTipoMidia } from "@/lib/tipo-midia";
import { textoPadraoDaMidia, type TipoAnexo } from "@/lib/anexo-mensagem";

export type { TipoAnexo };

/**
 * Fotos, documentos, áudios e vídeos que a família manda pelo WhatsApp. O webhook traz só o
 * id da mídia: o arquivo é baixado da Graph API (com o token da escola) e guardado no
 * armazenamento privado do ClassLink, para a equipe ver na conversa por link assinado.
 *
 * Meta (developers.facebook.com/documentation/business-messaging/whatsapp/business-phone-numbers/media):
 * GET /<MEDIA_ID> devolve `url` e `mime_type`; a `url` vence em 5 minutos e exige o mesmo
 * token no download; o id de mídia recebida por webhook fica disponível por 7 dias.
 */

export interface MidiaRecebida {
  tipo: TipoAnexo;
  mediaId: string;
  mime: string | null;
  legenda: string | null;
  nomeArquivo: string | null;
  /** Algumas entregas do webhook já trazem a URL de download. */
  url: string | null;
}

interface MidiaNoWebhook {
  id?: string;
  mime_type?: string;
  caption?: string;
  filename?: string;
  url?: string;
}

const TIPOS: readonly TipoAnexo[] = ["image", "sticker", "document", "audio", "video"];

/** Limites do ClassLink (a Meta aceita documentos de até 100 MB; acima disto, fica o aviso). */
export const LIMITE_BYTES: Record<TipoAnexo, number> = {
  image: 8 * 1024 * 1024,
  sticker: 1024 * 1024,
  audio: 16 * 1024 * 1024,
  video: 16 * 1024 * 1024,
  document: 16 * 1024 * 1024,
};

/** Formatos que a Cloud API entrega, com a extensão usada no arquivo guardado. */
const EXTENSOES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "audio/aac": "aac",
  "audio/amr": "amr",
  "audio/mpeg": "mp3",
  "audio/mp4": "m4a",
  "audio/ogg": "ogg",
  "video/mp4": "mp4",
  "video/3gpp": "3gp",
  "text/plain": "txt",
  "application/pdf": "pdf",
  "application/msword": "doc",
  "application/vnd.ms-excel": "xls",
  "application/vnd.ms-powerpoint": "ppt",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": "pptx",
};

/** Texto que fica no corpo da mensagem (e nos avisos): a legenda, ou o texto padrão. */
export function corpoDaMidia(midia: Pick<MidiaRecebida, "tipo" | "legenda">): string {
  return midia.legenda?.trim() || textoPadraoDaMidia(midia.tipo);
}

/** Mídia da mensagem do webhook (msg.image, msg.document...), ou null se não é mídia. */
export function midiaDaMensagem(msg: { type: string } & Record<string, unknown>): MidiaRecebida | null {
  if (!TIPOS.includes(msg.type as TipoAnexo)) return null;
  const dados = msg[msg.type] as MidiaNoWebhook | undefined;
  if (!dados?.id) return null;
  return {
    tipo: msg.type as TipoAnexo,
    mediaId: dados.id,
    mime: dados.mime_type ?? null,
    legenda: dados.caption?.trim() || null,
    nomeArquivo: dados.filename?.trim() || null,
    url: dados.url ?? null,
  };
}

/** "audio/ogg; codecs=opus" → "audio/ogg". */
export function mimeBase(mime: string | null | undefined): string | null {
  const base = mime?.split(";")[0]?.trim().toLowerCase();
  return base || null;
}

function apiBaseUrl() {
  return (process.env.WHATSAPP_API_URL || "https://graph.facebook.com/v21.0").replace(/\/$/, "");
}

const TEMPO_LIMITE_MS = 10_000;

/** Baixa a mídia na Meta. Lança erro com o motivo (vai para os logs). */
export async function baixarMidiaDoWhatsApp(midia: MidiaRecebida): Promise<{ bytes: Buffer; mime: string | null }> {
  const token = process.env.WHATSAPP_API_TOKEN;
  if (!token) throw new Error("WHATSAPP_API_TOKEN não configurado");
  const auth = { Authorization: `Bearer ${token}` };
  const limite = LIMITE_BYTES[midia.tipo];

  let url = midia.url;
  let mime = mimeBase(midia.mime);
  if (!url) {
    const meta = await fetch(`${apiBaseUrl()}/${encodeURIComponent(midia.mediaId)}`, {
      headers: auth,
      signal: AbortSignal.timeout(TEMPO_LIMITE_MS),
    });
    const dados = (await meta.json().catch(() => ({}))) as { url?: string; mime_type?: string; file_size?: number; error?: { message?: string } };
    if (!meta.ok || !dados.url) throw new Error(`Meta não devolveu a URL da mídia (${meta.status}): ${dados.error?.message ?? "sem url"}`);
    if (typeof dados.file_size === "number" && dados.file_size > limite) throw new Error(`Mídia grande demais (${dados.file_size} bytes)`);
    url = dados.url;
    mime = mimeBase(dados.mime_type) ?? mime;
  }

  // Só baixa de endereço https (a URL vem da Meta, mas não custa conferir).
  if (!/^https:\/\//i.test(url) && !process.env.WHATSAPP_API_URL) throw new Error("URL de mídia inesperada");
  const arquivo = await fetch(url, { headers: auth, signal: AbortSignal.timeout(TEMPO_LIMITE_MS) });
  if (!arquivo.ok) throw new Error(`Download da mídia falhou (${arquivo.status})`);
  const tamanho = Number(arquivo.headers.get("content-length"));
  if (Number.isFinite(tamanho) && tamanho > limite) throw new Error(`Mídia grande demais (${tamanho} bytes)`);
  const bytes = Buffer.from(await arquivo.arrayBuffer());
  if (bytes.byteLength > limite) throw new Error(`Mídia grande demais (${bytes.byteLength} bytes)`);
  return { bytes, mime: mimeBase(arquivo.headers.get("content-type")) ?? mime };
}

/**
 * Tipo do arquivo a guardar. Foto/figurinha/vídeo: vale o que os bytes dizem (não o que foi
 * informado). Áudio/documento: só formatos da lista da Meta — nada que o navegador execute.
 */
export function tipoParaGuardar(tipo: TipoAnexo, bytes: Uint8Array, mimeInformado: string | null): { mime: string; extensao: string } | null {
  if (tipo === "image" || tipo === "sticker") {
    const real = detectarTipoMidia(bytes);
    return real?.kind === "image" ? { mime: real.mime, extensao: real.extensao } : null;
  }
  const mime = mimeBase(mimeInformado);
  if (!mime || !EXTENSOES[mime]) return null;
  if (tipo === "audio" && !mime.startsWith("audio/")) return null;
  if (tipo === "video" && !mime.startsWith("video/")) return null;
  if (tipo === "document" && (mime.startsWith("audio/") || mime.startsWith("video/") || mime.startsWith("image/"))) return null;
  return { mime, extensao: EXTENSOES[mime] };
}

/**
 * Baixa e guarda a mídia. Devolve caminho e tipo, ou null quando não deu (o motivo vai para
 * o log) — a mensagem entra assim mesmo, com o aviso na tela.
 */
export async function guardarMidiaRecebida(midia: MidiaRecebida, schoolId: string): Promise<{ caminho: string; mime: string } | null> {
  try {
    const { bytes, mime } = await baixarMidiaDoWhatsApp(midia);
    const tipo = tipoParaGuardar(midia.tipo, bytes, mime);
    if (!tipo) throw new Error(`Formato não aceito (${mime ?? "desconhecido"})`);
    const caminho = `classlink/${schoolId}/whatsapp/${randomUUID()}.${tipo.extensao}`;
    await guardarArquivo(caminho, bytes, tipo.mime);
    return { caminho, mime: tipo.mime };
  } catch (err) {
    console.error(`WhatsApp: não foi possível guardar a mídia ${midia.mediaId} (${midia.tipo})`, err);
    return null;
  }
}
