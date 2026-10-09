import { describe, expect, it } from "vitest";
import { limparValorPublico, problemasConfigPublica } from "@/lib/firebase-config-publica";

const CHAVE = "AIzaSyA1234567890abcdefghijklmnopqrstuv";

describe("limparValorPublico", () => {
  it("remove espaço invisível, BOM, aspas curvas e quebras de linha", () => {
    expect(limparValorPublico(`​${CHAVE}​`)).toBe(CHAVE);
    expect(limparValorPublico(`﻿“${CHAVE}”\n`)).toBe(CHAVE);
    expect(limparValorPublico(`"${CHAVE}"`)).toBe(CHAVE);
    expect(limparValorPublico("   ")).toBeUndefined();
  });

  it("o resultado sempre é aceito como cabeçalho HTTP", () => {
    expect(() => new Headers({ "x-goog-api-key": limparValorPublico(`${CHAVE}​ `)! })).not.toThrow();
  });
});

describe("problemasConfigPublica", () => {
  it("aponta a variável com caractere a mais ou formato errado, sem expor o valor", () => {
    const p = problemasConfigPublica({
      NEXT_PUBLIC_FIREBASE_API_KEY: `${CHAVE}​`,
      NEXT_PUBLIC_FIREBASE_PROJECT_ID: "classlink-123",
      NEXT_PUBLIC_FIREBASE_APP_ID: "errado",
    });
    expect(p).toEqual([
      { nome: "NEXT_PUBLIC_FIREBASE_API_KEY", problema: "tem espaço, aspas ou caractere invisível a mais" },
      { nome: "NEXT_PUBLIC_FIREBASE_APP_ID", problema: "formato inesperado — confira se colou o valor certo" },
    ]);
    expect(JSON.stringify(p)).not.toContain(CHAVE);
  });
});
