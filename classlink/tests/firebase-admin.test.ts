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

describe("credenciaisDaConta", () => {
  it("com o JSON inteiro colado, e-mail e projeto vêm do próprio arquivo", async () => {
    const { credenciaisDaConta } = await import("@/lib/firebase-admin");
    const json = JSON.stringify({
      project_id: "classlink-certo",
      client_email: "firebase-adminsdk@classlink-certo.iam.gserviceaccount.com",
      private_key: "-----BEGIN PRIVATE KEY-----\nAAAA\n-----END PRIVATE KEY-----\n",
    });
    const c = credenciaisDaConta({
      FIREBASE_PRIVATE_KEY: json,
      FIREBASE_CLIENT_EMAIL: "antigo@outro.iam.gserviceaccount.com",
      FIREBASE_PROJECT_ID: "outro",
    });
    expect(c.clientEmail).toBe("firebase-adminsdk@classlink-certo.iam.gserviceaccount.com");
    expect(c.projectId).toBe("classlink-certo");
    expect(c.privateKey).toContain("BEGIN PRIVATE KEY");
  });

  it("sem JSON, usa as variáveis separadas, limpas", async () => {
    const { credenciaisDaConta } = await import("@/lib/firebase-admin");
    const c = credenciaisDaConta({ FIREBASE_CLIENT_EMAIL: " conta@p.iam.gserviceaccount.com​\n", FIREBASE_PROJECT_ID: "\"p\"" });
    expect(c.clientEmail).toBe("conta@p.iam.gserviceaccount.com");
    expect(c.projectId).toBe("p");
  });
});
