import { describe, expect, it } from "vitest";
import { candidatosDeBucket, explicarErroStorage } from "@/lib/firebase-storage";

describe("bucket do Firebase Storage", () => {
  it("usa o configurado (limpo) e os padrões do projeto como reserva", () => {
    expect(candidatosDeBucket({ NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET: " gs://classlink-1.appspot.com/​", FIREBASE_PROJECT_ID: "classlink-1" })).toEqual([
      "classlink-1.appspot.com",
      "classlink-1.firebasestorage.app",
    ]);
  });

  it("sem a variável, tenta os nomes padrão do projeto", () => {
    expect(candidatosDeBucket({ FIREBASE_PROJECT_ID: "classlink-1" })).toEqual(["classlink-1.firebasestorage.app", "classlink-1.appspot.com"]);
    expect(candidatosDeBucket({ NEXT_PUBLIC_FIREBASE_PROJECT_ID: "outro" })).toEqual(["outro.firebasestorage.app", "outro.appspot.com"]);
    expect(candidatosDeBucket({})).toEqual([]);
  });

  it("traduz os erros mais comuns do Storage", () => {
    expect(explicarErroStorage({ code: 404, message: "The specified bucket does not exist." })).toMatch(/Começar/);
    expect(explicarErroStorage({ code: 403, message: "x does not have storage.objects.create access" })).toMatch(/permissão/);
    expect(explicarErroStorage(new Error("invalid_grant: account not found"))).toMatch(/nova chave/);
  });
});
