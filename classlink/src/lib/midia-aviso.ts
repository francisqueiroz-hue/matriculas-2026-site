import { ErroDeUsuario } from "@/lib/erros";

/**
 * Regras do anexo de um aviso do Mural: uma foto, um vídeo ou um PDF já convertido em imagens
 * (uma por página, convertidas no navegador — o PDF original não é guardado).
 * Compartilhadas entre a tela (mensagens e limites) e o servidor (validação).
 */
export const MAX_PAGINAS_PDF = 10;
export const MAX_BYTES_PDF = 20 * 1024 * 1024; // PDF lido no navegador, antes de converter
export const MAX_BYTES_VIDEO = 50 * 1024 * 1024; // mesmo limite do envio de vídeos do app

export type TipoAnexoAviso = "image" | "video" | "pdf";

const TIPOS_FOTO = ["image/jpeg", "image/png", "image/webp"];
const TIPOS_VIDEO = ["video/mp4", "video/webm", "video/quicktime"];

/** Tipo do anexo escolhido, ou a mensagem explicando por que não serve (antes de enviar qualquer coisa). */
export function tipoDoAnexo(arquivo: { type: string; name: string; size: number }): TipoAnexoAviso | { erro: string } {
  const tipo = arquivo.type || (/\.pdf$/i.test(arquivo.name) ? "application/pdf" : "");
  if (tipo === "application/pdf") {
    if (arquivo.size > MAX_BYTES_PDF) return { erro: `O PDF passa de ${MAX_BYTES_PDF / 1024 / 1024} MB. Reduza o arquivo e anexe de novo.` };
    return "pdf";
  }
  if (TIPOS_FOTO.includes(tipo)) return "image";
  if (TIPOS_VIDEO.includes(tipo)) {
    if (arquivo.size > MAX_BYTES_VIDEO) {
      return { erro: `O vídeo passa de ${MAX_BYTES_VIDEO / 1024 / 1024} MB. Grave um trecho menor ou reduza a qualidade e anexe de novo.` };
    }
    return "video";
  }
  if (tipo.startsWith("image/")) return { erro: "Formato de foto não aceito. Use JPG, PNG ou WEBP." };
  if (tipo.startsWith("video/")) return { erro: "Formato de vídeo não aceito. Use MP4, MOV ou WEBM." };
  return { erro: "Anexe uma foto (JPG, PNG, WEBP), um vídeo (MP4, MOV, WEBM) ou um PDF." };
}

/** Extensões gravadas pelo envio (/api/upload usa o subtipo do MIME; o envio direto usa a curta). */
const EXT_IMAGEM = ["jpg", "jpeg", "png", "webp"];
const EXT_VIDEO = ["mp4", "webm", "mov", "quicktime"];

/** O caminho é um arquivo enviado por esta escola (classlink/<escola>/<uuid>.<ext>) do tipo esperado? */
export function caminhoDeMidiaDaEscola(caminho: string, escolaId: string, tipo: "image" | "video"): boolean {
  const escola = escolaId.replace(/[^A-Za-z0-9_-]/g, "");
  if (!escola) return false;
  const exts = (tipo === "image" ? EXT_IMAGEM : EXT_VIDEO).join("|");
  return new RegExp(`^classlink/${escola}/[0-9a-f-]{36}\\.(${exts})$`).test(caminho);
}

export interface MidiaInformada {
  mediaUrl?: string;
  mediaType?: TipoAnexoAviso;
  mediaPaginas?: string[];
  mediaNome?: string;
}

export interface MidiaDoAviso {
  mediaUrl: string | null;
  mediaType: TipoAnexoAviso | null;
  mediaPaginas: string[];
  mediaNome: string | null;
}

/**
 * Confere o anexo enviado pela tela antes de gravar o aviso. Só aceita arquivos que a própria
 * escola enviou (impede apontar para o arquivo de outra escola e receber um link assinado dele)
 * e do tipo certo; no PDF, de 1 a MAX_PAGINAS_PDF imagens, e a 1ª página vira a mídia principal.
 */
export function validarMidiaDoAviso(entrada: MidiaInformada, escolaId: string): MidiaDoAviso {
  const paginas = entrada.mediaPaginas ?? [];
  const nome = entrada.mediaNome?.trim() || null;

  if (!entrada.mediaType) {
    if (entrada.mediaUrl || paginas.length) throw new ErroDeUsuario("Informe o tipo do anexo.", 400);
    return { mediaUrl: null, mediaType: null, mediaPaginas: [], mediaNome: null };
  }

  if (entrada.mediaType === "pdf") {
    if (paginas.length === 0) throw new ErroDeUsuario("O PDF não tem páginas convertidas para publicar.", 400);
    if (paginas.length > MAX_PAGINAS_PDF) {
      throw new ErroDeUsuario(`O PDF pode ter no máximo ${MAX_PAGINAS_PDF} páginas.`, 400);
    }
    if (new Set(paginas).size !== paginas.length || !paginas.every((p) => caminhoDeMidiaDaEscola(p, escolaId, "image"))) {
      throw new ErroDeUsuario("As páginas do PDF não foram enviadas corretamente. Anexe o arquivo de novo.", 400);
    }
    return { mediaUrl: paginas[0], mediaType: "pdf", mediaPaginas: paginas, mediaNome: nome?.slice(0, 200) ?? null };
  }

  if (paginas.length) throw new ErroDeUsuario("Páginas só são aceitas em anexo PDF.", 400);
  if (!entrada.mediaUrl || !caminhoDeMidiaDaEscola(entrada.mediaUrl, escolaId, entrada.mediaType)) {
    throw new ErroDeUsuario("O anexo não foi enviado corretamente. Anexe o arquivo de novo.", 400);
  }
  return { mediaUrl: entrada.mediaUrl, mediaType: entrada.mediaType, mediaPaginas: [], mediaNome: null };
}
