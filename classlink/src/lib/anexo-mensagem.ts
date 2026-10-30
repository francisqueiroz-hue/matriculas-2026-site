import { textoPadraoDoArquivo } from "@/lib/anexo-envio";

/**
 * Rótulos dos anexos de mensagens (fotos, documentos... recebidos pelo WhatsApp ou enviados pelo app). Sem
 * dependências de servidor: usado também na tela da conversa.
 */
export type TipoAnexo = "image" | "sticker" | "document" | "audio" | "video";

const ROTULOS: Record<TipoAnexo, string> = {
  image: "📷 Foto",
  sticker: "🖼️ Figurinha",
  document: "📄 Documento",
  audio: "🎤 Áudio",
  video: "🎬 Vídeo",
};

export function rotuloDoAnexo(tipo: string): string {
  return ROTULOS[tipo as TipoAnexo] ?? "📎 Arquivo";
}

const RECEBIDO: Record<TipoAnexo, string> = {
  image: "recebida",
  sticker: "recebida",
  document: "recebido",
  audio: "recebido",
  video: "recebido",
};

/** Texto padrão de uma mídia sem legenda: "📷 Foto recebida pelo WhatsApp". */
export function textoPadraoDaMidia(tipo: string): string {
  return `${rotuloDoAnexo(tipo)} ${RECEBIDO[tipo as TipoAnexo] ?? "recebido"} pelo WhatsApp`;
}

/** O corpo da mensagem é só o texto padrão (ninguém escreveu legenda)? */
export function semLegenda(body: string, tipo: string): boolean {
  const texto = body.trim();
  return texto === textoPadraoDaMidia(tipo) || ((tipo === "document" || tipo === "image") && texto === textoPadraoDoArquivo(tipo));
}

/** Aviso para quando o arquivo não pôde ser baixado do WhatsApp. */
export function avisoAnexoIndisponivel(tipo: string): string {
  return `${rotuloDoAnexo(tipo)}: não foi possível baixar o arquivo do WhatsApp. Peça à família para reenviar.`;
}
