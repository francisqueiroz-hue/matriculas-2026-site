import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Link interno e temporário para exibir uma mídia privada (Vercel Blob): /api/midia?p=…&e=…&s=…
 * O arquivo nunca fica público; quem tem o link só lê aquele arquivo até `e` (validade).
 * Assinado com HMAC-SHA256 usando o segredo do app (JWT_ACCESS_SECRET).
 */
export const ROTA_MIDIA = "/api/midia";

function segredo(): string {
  const s = process.env.JWT_ACCESS_SECRET;
  if (!s) throw new Error("JWT_ACCESS_SECRET não configurado");
  return `midia:${s}`;
}

function assinatura(caminho: string, expiraEm: number): string {
  return createHmac("sha256", segredo()).update(`${caminho}\n${expiraEm}`).digest("base64url");
}

export function linkAssinado(caminho: string, validadeMs: number, agora = Date.now()): string {
  const e = agora + validadeMs;
  const q = new URLSearchParams({ p: caminho, e: String(e), s: assinatura(caminho, e) });
  return `${ROTA_MIDIA}?${q.toString()}`;
}

/** Caminho autorizado pelo link, ou null se a assinatura não confere ou o link venceu. */
export function conferirLink(params: URLSearchParams, agora = Date.now()): string | null {
  const p = params.get("p");
  const e = Number(params.get("e"));
  const s = params.get("s");
  if (!p || !s || !Number.isFinite(e) || e < agora) return null;
  // Só arquivos das pastas do app (nada de "../" nem caminhos arbitrários).
  if (!/^classlink\/[A-Za-z0-9_-]+\/[A-Za-z0-9_.\/-]+$/.test(p) || p.includes("..")) return null;
  const esperado = Buffer.from(assinatura(p, e));
  const recebido = Buffer.from(s);
  return esperado.length === recebido.length && timingSafeEqual(esperado, recebido) ? p : null;
}
