import { describe, expect, it } from "vitest";
import { sugerirTurmas } from "@/components/ImportarCardapios";
import pacote from "@/dados/cardapios-out-dez-2026.json";

describe("sugestão de turmas na importação", () => {
  const turmas = ["Berçário", "Maternalzinho", "Maternal 1", "Maternal 2", "Pré I", "Pré II", "1º Ano", "2º Ano", "3º Ano A", "4° ano B", "5º Ano", "11º Ano"].map(
    (name, i) => ({ id: String(i), name }),
  );
  const nome = (id: string) => turmas.find((t) => t.id === id)!.name;
  const mapa = sugerirTurmas(pacote as never, turmas);

  it("cada segmento recebe as turmas certas e 2º, 3º e 4º ano ficam de fora", () => {
    expect(mapa[0].map(nome)).toEqual(["Berçário"]);
    expect(mapa[1].map(nome)).toEqual(["Maternalzinho", "Maternal 1"]);
    expect(mapa[2].map(nome)).toEqual(["Maternal 2", "Pré I", "Pré II"]);
    expect(mapa[3].map(nome)).toEqual(["1º Ano", "5º Ano"]);
  });
});
