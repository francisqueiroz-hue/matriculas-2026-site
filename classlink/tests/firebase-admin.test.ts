import { afterEach, describe, expect, it, vi } from "vitest";

describe("Firebase Admin com chave inválida", () => {
  const envOriginal = { ...process.env };
  afterEach(() => {
    process.env = { ...envOriginal };
    vi.resetModules();
  });

  it("não lança erro: devolve null e informa o motivo", async () => {
    process.env.FIREBASE_PROJECT_ID = "projeto";
    process.env.FIREBASE_CLIENT_EMAIL = "conta@projeto.iam.gserviceaccount.com";
    process.env.FIREBASE_PRIVATE_KEY = "chave-colada-errada";
    const { erroFirebaseAdmin, getFirebaseAdminApp } = await import("@/lib/firebase-admin");
    expect(() => getFirebaseAdminApp()).not.toThrow();
    expect(getFirebaseAdminApp()).toBeNull();
    expect(erroFirebaseAdmin()).toBeTruthy();
  });

  it("sem variáveis, fica apenas desativado", async () => {
    delete process.env.FIREBASE_PROJECT_ID;
    const { erroFirebaseAdmin, getFirebaseAdminApp } = await import("@/lib/firebase-admin");
    expect(getFirebaseAdminApp()).toBeNull();
    expect(erroFirebaseAdmin()).toBeNull();
  });
});

describe("chave privada colada de jeitos diferentes", () => {
  it("todas as variações viram o mesmo PEM válido", async () => {
    const { generateKeyPairSync, createPrivateKey } = await import("crypto");
    const { normalizarChavePrivada } = await import("@/lib/firebase-admin");
    const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
    const pem = privateKey.export({ type: "pkcs8", format: "pem" }).toString();
    const escapada = JSON.stringify(pem).slice(1, -1); // como aparece no arquivo JSON (\n literais)
    const variacoes = [
      pem,
      escapada,
      `"${escapada}"`,
      `"${escapada}",`,
      `"private_key": "${escapada}",`,
      pem.replace(/\n/g, " "),
      pem.replace(/\n/g, "\r\n"),
      escapada.replace(/\\n/g, "\\\\n"),
      JSON.stringify({ type: "service_account", private_key: pem, client_email: "x@y" }),
    ];
    for (const v of variacoes) {
      const normalizada = normalizarChavePrivada(v)!;
      expect(normalizada).toBe(pem);
      expect(() => createPrivateKey(normalizada)).not.toThrow();
    }
    expect(normalizarChavePrivada("")).toBeUndefined();
    expect(normalizarChavePrivada(undefined)).toBeUndefined();
  });
});
