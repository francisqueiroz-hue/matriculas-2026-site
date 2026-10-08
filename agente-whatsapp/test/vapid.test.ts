import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { buildPushPayload } from "@block65/webcrypto-web-push";
import { describe, expect, it } from "vitest";

describe("chaves VAPID geradas por scripts/gerar-vapid.ts", () => {
  it("a biblioteca de Web Push aceita o par gerado", async () => {
    const saida = execFileSync("npx", ["tsx", join(import.meta.dirname, "..", "scripts", "gerar-vapid.ts")], { encoding: "utf8" });
    const publicKey = saida.match(/VAPID_PUBLIC_KEY=(\S+)/)![1];
    const privateKey = saida.match(/VAPID_PRIVATE_KEY=(\S+)/)![1];
    const navegador = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]);
    const raw = new Uint8Array(await crypto.subtle.exportKey("raw", navegador.publicKey));
    const p256dh = Buffer.from(raw).toString("base64url");
    const auth = Buffer.from(crypto.getRandomValues(new Uint8Array(16))).toString("base64url");
    const payload = await buildPushPayload({ data: "oi" }, { endpoint: "https://push.exemplo/abc", expirationTime: null, keys: { p256dh, auth } }, { subject: "mailto:a@b.co", publicKey, privateKey });
    expect(String(payload.method).toUpperCase()).toBe("POST");
    expect(JSON.stringify(payload.headers).toLowerCase()).toContain("vapid");
  }, 30000);
});
