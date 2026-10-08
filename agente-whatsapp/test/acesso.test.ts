import { describe, expect, it } from "vitest";
import { validarAcesso } from "../src/acesso";
import type { Env } from "../src/tipos";

const env = { ACCESS_TEAM_DOMAIN: "escola.cloudflareaccess.com", ACCESS_AUD: "aud123", DONO_EMAIL: "dono@escola.com" } as Env;
const b64u = (b: ArrayBuffer | string) => Buffer.from(typeof b === "string" ? b : new Uint8Array(b)).toString("base64url");

async function par() {
  const k = await crypto.subtle.generateKey({ name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" }, true, ["sign", "verify"]);
  const jwk = { ...(await crypto.subtle.exportKey("jwk", k.publicKey)), kid: "k1", alg: "RS256", use: "sig" };
  return { priv: k.privateKey, jwk };
}
async function token(priv: CryptoKey, over: Record<string, unknown> = {}, kid = "k1") {
  const cab = b64u(JSON.stringify({ alg: "RS256", kid, typ: "JWT" }));
  const corpo = b64u(JSON.stringify({ aud: ["aud123"], iss: "https://escola.cloudflareaccess.com", email: "dono@escola.com", exp: Math.floor(Date.now() / 1000) + 600, ...over }));
  const sig = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", priv, new TextEncoder().encode(`${cab}.${corpo}`));
  return `${cab}.${corpo}.${b64u(sig)}`;
}
const req = (jwt?: string) => new Request("https://x/painel/api/resumo", { headers: jwt ? { "cf-access-jwt-assertion": jwt } : {} });

describe("validarAcesso (Cloudflare Access)", () => {
  it("aceita um JWT válido do e-mail do dono", async () => {
    const { priv, jwk } = await par();
    const f = (async () => new Response(JSON.stringify({ keys: [jwk] }))) as unknown as typeof fetch;
    expect(await validarAcesso(req(await token(priv)), env, f)).toEqual({ email: "dono@escola.com" });
  });
  it("rejeita: sem cabeçalho, adulterado, expirado, aud/iss/e-mail errados, kid desconhecido", async () => {
    const { priv, jwk } = await par();
    const f = (async () => new Response(JSON.stringify({ keys: [jwk] }))) as unknown as typeof fetch;
    const ok = await token(priv);
    const [h, p, s] = ok.split(".");
    const adulterado = `${h}.${b64u(JSON.stringify({ aud: ["aud123"], iss: "https://escola.cloudflareaccess.com", email: "outro@x.com", exp: 9999999999 }))}.${s}`;
    const casos: [string, string | undefined][] = [
      ["sem cabeçalho", undefined],
      ["adulterado", adulterado],
      ["expirado", await token(priv, { exp: 1 })],
      ["aud errado", await token(priv, { aud: ["outro"] })],
      ["iss errado", await token(priv, { iss: "https://mal.cloudflareaccess.com" })],
      ["e-mail de outra pessoa", await token(priv, { email: "intruso@x.com" })],
      ["kid desconhecido", await token(priv, {}, "zzz")],
    ];
    for (const [nome, jwt] of casos) expect(await validarAcesso(req(jwt), env, f), nome).toBeNull();
    void p;
  });
  it("sem configuração do Access, falha fechado", async () => {
    const { priv } = await par();
    expect(await validarAcesso(req(await token(priv)), {} as Env)).toBeNull();
  });
  it("falha de rede ao buscar as chaves = negado", async () => {
    const { priv } = await par();
    const f = (async () => { throw new Error("rede"); }) as unknown as typeof fetch;
    expect(await validarAcesso(req(await token(priv)), env, f)).toBeNull();
  });
});
