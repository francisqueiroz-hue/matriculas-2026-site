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
