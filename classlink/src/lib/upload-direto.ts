/**
 * Envio direto do navegador para o Vercel Blob (privado), para arquivos maiores que o limite
 * de corpo das funções da Vercel (~4,5 MB) — vídeos, principalmente. Regras compartilhadas
 * entre o servidor (autorização) e o navegador.
 */
export const LIMITE_ENVIO_PELO_SERVIDOR = 4 * 1024 * 1024; // abaixo disso, segue /api/upload
export const MAX_ENVIO_DIRETO = 50 * 1024 * 1024; // mesmo limite de vídeo do app

export const TIPOS_ENVIO_DIRETO: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "video/mp4": "mp4",
  "video/webm": "webm",
  "video/quicktime": "mov",
};

/** Caminho permitido: classlink/<escola da sessão>/<uuid>.<extensão aceita>. */
export function caminhoDiretoValido(caminho: string, escolaId: string): boolean {
  const ext = Object.values(TIPOS_ENVIO_DIRETO).join("|");
  const re = new RegExp(`^classlink/${escolaId.replace(/[^A-Za-z0-9_-]/g, "")}/[0-9a-f-]{36}\\.(${ext})$`);
  return re.test(caminho);
}
