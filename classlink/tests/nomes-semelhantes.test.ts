import { describe, expect, it } from "vitest";
import { idsComNomeRepetido, nomesSemelhantes } from "@/lib/nomes-semelhantes";

describe("responsável com nome parecido", () => {
  it("considera iguais variações de acento, caixa e partículas", () => {
    expect(nomesSemelhantes("Maria José da Silva", "maria jose silva")).toBe(true);
    expect(nomesSemelhantes("Maria Silva", "Maria da Costa Silva")).toBe(true);
    expect(nomesSemelhantes("  CARLOS   souza ", "Carlos Souza")).toBe(true);
  });

  it("não confunde pessoas diferentes", () => {
    expect(nomesSemelhantes("Maria Silva", "Maria Souza")).toBe(false);
    expect(nomesSemelhantes("Maria", "Mariana")).toBe(false);
    expect(nomesSemelhantes("Ana Paula", "Ana")).toBe(false);
    expect(nomesSemelhantes("", "Ana")).toBe(false);
  });

  it("marca os dois cadastros do mesmo nome", () => {
    const ids = idsComNomeRepetido([
      { id: "1", name: "Maria Silva" },
      { id: "2", name: "Carlos Souza" },
      { id: "3", name: "Maria da Silva" },
    ]);
    expect([...ids].sort()).toEqual(["1", "3"]);
  });
});
