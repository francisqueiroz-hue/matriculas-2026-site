/** Gera o par de chaves VAPID (Web Push). Guarde a privada como segredo do Worker; a pública vai também ao painel. */
const par = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
const jwk = await crypto.subtle.exportKey("jwk", par.privateKey);
const publica = new Uint8Array([4, ...Buffer.from(jwk.x!, "base64url"), ...Buffer.from(jwk.y!, "base64url")]);
console.log(`VAPID_PUBLIC_KEY=${Buffer.from(publica).toString("base64url")}\nVAPID_PRIVATE_KEY=${jwk.d}`);
export {};
