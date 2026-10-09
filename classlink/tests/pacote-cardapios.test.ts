import { describe, expect, it } from "vitest";
import pacote from "@/dados/cardapios-out-dez-2026.json";
import { pacoteCardapiosSchema, ehSegunda, textoCardapio } from "@/lib/cardapios";

describe("pacote de cardápios out–dez/2026 (PDFs da nutricionista)", () => {
  const p = pacoteCardapiosSchema.parse(pacote);
  const seg = (nome: string) => p.segmentos.find((s) => s.nome.startsWith(nome))!;
  const item = (nome: string, refeicao: string, dia: "seg" | "ter" | "qua" | "qui" | "sex") => {
    const s = seg(nome);
    return s.conteudo.itens[dia][s.conteudo.refeicoes.indexOf(refeicao)];
  };

  it("12 semanas, de 12/10 a 28/12, todas começando na segunda", () => {
    expect(p.semanas).toHaveLength(12);
    expect(p.semanas[0]).toBe("2026-10-12");
    expect(p.semanas.at(-1)).toBe("2026-12-28");
    expect(p.semanas.every(ehSegunda)).toBe(true);
  });

  it("4 cardápios com as 5 refeições do PDF", () => {
    expect(p.segmentos.map((s) => s.nome)).toEqual([
      "Berçário (6 meses a 1 ano)",
      "Maternalzinho e Maternal 1",
      "Educação Infantil (2 a 5 anos)",
      "Ensino Fundamental I",
    ]);
    for (const s of p.segmentos) expect(s.conteudo.refeicoes).toEqual(["Colação", "Almoço", "Sobremesa", "Lanche", "Jantar"]);
  });

  it("confere pontos que diferem entre os segmentos", () => {
    expect(item("Berçário", "Lanche", "seg")).toBe("Frutas frescas");
    expect(item("Berçário", "Jantar", "qui")).toContain("beterraba cozida");
    expect(item("Berçário", "Almoço", "qui")).toContain("couve refogada");
    expect(item("Maternalzinho", "Almoço", "sex")).toContain("purê de inhame");
    expect(item("Educação Infantil", "Almoço", "sex")).toContain("mix de legumes, farofa");
    expect(item("Educação Infantil", "Lanche", "qua")).toContain("biscoito de polvilho");
    expect(item("Ensino Fundamental I", "Lanche", "qua")).toContain("pipoca");
    expect(item("Ensino Fundamental I", "Almoço", "seg")).toContain("Carne moída");
    expect(item("Maternalzinho", "Jantar", "qua")).toBe(item("Maternalzinho", "Almoço", "qua"));
  });

  it("texto do Mural fica completo", () => {
    const t = textoCardapio("2026-10-12", seg("Ensino Fundamental I").conteudo, p.observacoes);
    expect(t).toContain("Segunda (12/10)\n• Colação: Frutas frescas\n• Almoço: Carne moída");
    expect(t).toContain("Sexta (16/10)");
    expect(t).toContain("Observações:");
  });
});
