/**
 * Identifica o tipo real de uma imagem/vídeo pelos primeiros bytes (assinatura do formato), em vez
 * de confiar no `Content-Type` enviado pelo navegador, que qualquer cliente pode falsificar.
 * Só reconhece os formatos que o app aceita.
 */
export type TipoMidia = { kind: "image" | "video"; mime: string; extensao: string };

const ascii = (b: Uint8Array, ini: number, fim: number) => String.fromCharCode(...b.slice(ini, fim));

export function detectarTipoMidia(bytes: Uint8Array): TipoMidia | null {
  if (bytes.length < 12) return null;
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return { kind: "image", mime: "image/jpeg", extensao: "jpg" };
  if (bytes[0] === 0x89 && ascii(bytes, 1, 4) === "PNG" && bytes[4] === 0x0d && bytes[5] === 0x0a) {
    return { kind: "image", mime: "image/png", extensao: "png" };
  }
  if (ascii(bytes, 0, 4) === "RIFF" && ascii(bytes, 8, 12) === "WEBP") return { kind: "image", mime: "image/webp", extensao: "webp" };
  if (bytes[0] === 0x1a && bytes[1] === 0x45 && bytes[2] === 0xdf && bytes[3] === 0xa3) {
    return { kind: "video", mime: "video/webm", extensao: "webm" };
  }
  if (ascii(bytes, 4, 8) === "ftyp") {
    const marca = ascii(bytes, 8, 12);
    if (marca === "qt  ") return { kind: "video", mime: "video/quicktime", extensao: "mov" };
    return { kind: "video", mime: "video/mp4", extensao: "mp4" };
  }
  return null;
}
