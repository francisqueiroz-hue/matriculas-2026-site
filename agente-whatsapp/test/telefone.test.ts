import { describe, expect, it } from "vitest";
import { mesmoTelefone, normalizarTelefone, variantesTelefone } from "../src/telefone";

describe("telefone BR", () => {
  it("normaliza formatos livres para E.164 sem +", () => {
    expect(normalizarTelefone("(21) 96469-9441")).toBe("5521964699441");
    expect(normalizarTelefone("+55 21 96469-9441")).toBe("5521964699441");
  });
  it("rejeita números inválidos", () => {
    expect(normalizarTelefone("123")).toBeNull();
    expect(normalizarTelefone("")).toBeNull();
  });
  it("gera variantes com e sem o nono dígito", () => {
    expect(variantesTelefone("552164699441")).toContain("5521964699441");
    expect(variantesTelefone("5521964699441")).toContain("552164699441");
  });
  it("compara números equivalentes", () => {
    expect(mesmoTelefone("21964699441", "552164699441")).toBe(true);
    expect(mesmoTelefone("21964699441", "21992865778")).toBe(false);
  });
});
