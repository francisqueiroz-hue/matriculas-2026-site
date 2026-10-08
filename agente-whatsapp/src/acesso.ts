import type { Env } from "./tipos";

/** Valida o JWT que o Cloudflare Access injeta (Cf-Access-Jwt-Assertion). Falha sempre fechada. */
const cache = new Map<string, { chaves: JsonWebKey[]; ate: number }>();
const b64uBytes = (s: string) => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));
const b64uJson = (s: string) => JSON.parse(new TextDecoder().decode(b64uBytes(s)));

async function chavesDe(dominio: string, f: typeof fetch): Promise<JsonWebKey[]> {
  const usarCache = f === fetch;
  const guardado = cache.get(dominio);
  if (usarCache && guardado && guardado.ate > Date.now()) return guardado.chaves;
  const r = await f(`https://${dominio}/cdn-cgi/access/certs`);
  if (!r.ok) throw new Error("não consegui buscar as chaves do Access");
  const chaves = ((await r.json()) as { keys?: JsonWebKey[] }).keys ?? [];
  if (usarCache) cache.set(dominio, { chaves, ate: Date.now() + 3600_000 });
  return chaves;
}

export async function validarAcesso(req: Request, env: Env, f: typeof fetch = fetch): Promise<{ email: string } | null> {
  const { ACCESS_TEAM_DOMAIN: dominio, ACCESS_AUD: aud, DONO_EMAIL: dono } = env;
  const jwt = req.headers.get("cf-access-jwt-assertion");
  if (!dominio || !aud || !dono || !jwt) return null;
  try {
    const [cab64, corpo64, sig64] = jwt.split(".");
    if (!cab64 || !corpo64 || !sig64) return null;
    const cab = b64uJson(cab64);
    if (cab.alg !== "RS256") return null;
    const jwk = (await chavesDe(dominio, f)).find((k) => (k as { kid?: string }).kid === cab.kid);
    if (!jwk) return null;
    const chave = await crypto.subtle.importKey("jwk", jwk, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]);
    const valida = await crypto.subtle.verify("RSASSA-PKCS1-v1_5", chave, b64uBytes(sig64), new TextEncoder().encode(`${cab64}.${corpo64}`));
    if (!valida) return null;
    const c = b64uJson(corpo64);
    const auds: string[] = Array.isArray(c.aud) ? c.aud : [c.aud];
    if (!auds.includes(aud) || c.iss !== `https://${dominio}` || typeof c.exp !== "number" || c.exp * 1000 < Date.now()) return null;
    if (String(c.email ?? "").toLowerCase() !== dono.toLowerCase()) return null;
    return { email: c.email };
  } catch {
    return null;
  }
}
