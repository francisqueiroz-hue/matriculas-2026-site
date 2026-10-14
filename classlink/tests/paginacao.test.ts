import { describe, it, expect } from "vitest";
import { juntarPaginas } from "@/lib/paginacao";

describe("juntarPaginas", () => {
  it("acrescenta a nova página ao final, na ordem", () => {
    expect(juntarPaginas([{ id: "a" }, { id: "b" }], [{ id: "c" }, { id: "d" }]).map((i) => i.id)).toEqual(["a", "b", "c", "d"]);
  });
  it("ignora itens já existentes (clique duplo, aviso recém-criado)", () => {
    expect(juntarPaginas([{ id: "a" }, { id: "b" }], [{ id: "b" }, { id: "c" }]).map((i) => i.id)).toEqual(["a", "b", "c"]);
  });
  it("ignora repetidos dentro da própria página nova", () => {
    expect(juntarPaginas([], [{ id: "a" }, { id: "a" }]).map((i) => i.id)).toEqual(["a"]);
  });
  it("devolve a mesma lista quando nada é novo", () => {
    const atual = [{ id: "a" }];
    expect(juntarPaginas(atual, [{ id: "a" }])).toBe(atual);
  });
  it("aceita lista vazia", () => {
    expect(juntarPaginas([], [])).toEqual([]);
  });
});
