import { detectarTipoMidia } from "@/lib/tipo-midia";

/**
 * Arquivos enviados pela aba Mensagens do ClassLink (declarações, atestados, documentos,
 * fotos de documentos), entre a família e a direção/coordenação. Regras compartilhadas entre
 * o servidor e o navegador — sem dependências de servidor.
 *
 * Até 4 MB o arquivo vai junto com a mensagem (corpo da função); acima disso, até 20 MB, o
 * navegador envia direto ao armazenamento privado (Vercel Blob) e o servidor confere depois.
 */
export const ANEXO_LIMITE_ENVIO_SERVIDOR = 4 * 1024 * 1024;
export const ANEXO_MAX_BYTES = 20 * 1024 * 1024;

/** Tipos aceitos (tipo informado pelo navegador → extensão). O servidor confere pelos bytes. */
export const TIPOS_ANEXO: Record<string, string> = {
  "application/pdf": "pdf",
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

/** Valor do atributo `accept` do campo de arquivo. */
export const ACCEPT_ANEXO = "application/pdf,image/jpeg,image/png,image/webp,.pdf,.jpg,.jpeg,.png,.webp";

export const MENSAGEM_TIPO_NAO_ACEITO = "Envie o arquivo em PDF ou como foto (JPG, PNG ou WEBP).";
export const MENSAGEM_ANEXO_GRANDE = `O arquivo passa de ${ANEXO_MAX_BYTES / 1024 / 1024} MB. Envie um arquivo menor (ou tire a foto de novo).`;

export type TipoAnexoEnviado = { tipo: "document" | "image"; mime: string; extensao: string };

/** Tipo real do arquivo pelos primeiros bytes (o tipo informado pelo navegador é falsificável). */
export function detectarTipoAnexo(bytes: Uint8Array): TipoAnexoEnviado | null {
  if (bytes.length >= 5 && String.fromCharCode(...bytes.slice(0, 5)) === "%PDF-") {
    return { tipo: "document", mime: "application/pdf", extensao: "pdf" };
  }
  const midia = detectarTipoMidia(bytes);
  if (midia?.kind === "image") return { tipo: "image", mime: midia.mime, extensao: midia.extensao };
  return null;
}

const limpo = (v: string) => v.replace(/[^A-Za-z0-9_-]/g, "");

/** Caminho permitido: classlink/<escola>/mensagens/<conversa>/<uuid>.<pdf|jpg|png|webp>. */
export function caminhoAnexoValido(caminho: string, escolaId: string, conversaId: string): boolean {
  if (!escolaId || !conversaId || limpo(escolaId) !== escolaId || limpo(conversaId) !== conversaId) return false;
  const ext = [...new Set(Object.values(TIPOS_ANEXO))].join("|");
  return new RegExp(`^classlink/${escolaId}/mensagens/${conversaId}/[0-9a-f-]{36}\\.(${ext})$`).test(caminho);
}

/** Nome para exibir: sem pastas, aspas, quebras de linha ou caracteres estranhos; até 120 caracteres. */
export function nomeAnexoSeguro(nome: string | null | undefined, extensao: string): string {
  const base = (nome ?? "").split(/[\\/]/).pop() ?? "";
  let saida = base
    .replace(/[\r\n"]/g, " ")
    .replace(/[^\p{L}\p{N} ._()-]/gu, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!saida || saida.startsWith(".")) saida = `arquivo.${extensao}`;
  if (saida.length > 120) saida = `${saida.slice(0, 110).trim()}.${extensao}`;
  return saida;
}

/** Conferência rápida no navegador, antes de enviar: devolve a mensagem de erro ou null. */
export function problemaNoAnexo(arquivo: { type: string; size: number; name: string }): string | null {
  const porNome = /\.(pdf|jpe?g|png|webp)$/i.test(arquivo.name);
  if (!TIPOS_ANEXO[arquivo.type] && !(arquivo.type === "" && porNome)) return MENSAGEM_TIPO_NAO_ACEITO;
  if (arquivo.size === 0) return "O arquivo está vazio.";
  if (arquivo.size > ANEXO_MAX_BYTES) return MENSAGEM_ANEXO_GRANDE;
  return null;
}

/** Texto da mensagem quando a pessoa manda só o arquivo, sem escrever nada. */
export function textoPadraoDoArquivo(tipo: "document" | "image"): string {
  return tipo === "document" ? "📄 Documento enviado" : "📷 Foto enviada";
}

/** Tamanho legível: "850 KB", "3,2 MB". */
export function tamanhoLegivel(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1).replace(".", ",")} MB`;
}
