import { describe, expect, it } from "vitest";
import { LIMITE_CARACTERES, LIMITE_LINHAS, precisaRecolher } from "@/lib/texto-recolhivel";

describe("precisaRecolher", () => {
  it("aviso curto aparece inteiro", () => {
    expect(precisaRecolher("Amanhã não haverá aula.")).toBe(false);
  });

  it("muitos caracteres recolhe", () => {
    expect(precisaRecolher("a".repeat(LIMITE_CARACTERES + 1))).toBe(true);
    expect(precisaRecolher("a".repeat(LIMITE_CARACTERES))).toBe(false);
  });

  it("muitas linhas recolhe (cardápio semanal tem uma por refeição)", () => {
    expect(precisaRecolher(Array(LIMITE_LINHAS + 1).fill("x").join("\n"))).toBe(true);
    expect(precisaRecolher(Array(LIMITE_LINHAS).fill("x").join("\n"))).toBe(false);
  });
});
