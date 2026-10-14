import { describe, expect, it } from "vitest";
import {
  agoraNaEscola,
  conteudoCardapioSchema,
  ehSegunda,
  salvarCardapioSchema,
  segundaDaSemana,
  textoCardapio,
  tituloCardapio,
} from "@/lib/cardapios";

const conteudo = {
  refeicoes: ["Lanche da manhã", "Almoço"],
  itens: { seg: ["Frutas", "Arroz, feijão e frango"], ter: ["", "Macarrão"], qua: ["", ""], qui: ["Bolo", ""], sex: ["", ""] },
};

describe("datas do cardápio", () => {
  it("segunda-feira da semana (domingo fecha a semana anterior)", () => {
    expect(segundaDaSemana("2026-10-12")).toBe("2026-10-12"); // segunda
    expect(segundaDaSemana("2026-10-16")).toBe("2026-10-12"); // sexta
    expect(segundaDaSemana("2026-10-17")).toBe("2026-10-12"); // sábado
    expect(segundaDaSemana("2026-10-18")).toBe("2026-10-12"); // domingo
    expect(segundaDaSemana("2026-11-02")).toBe("2026-11-02");
    expect(ehSegunda("2026-10-12")).toBe(true);
    expect(ehSegunda("2026-10-13")).toBe(false);
  });

  it("usa o horário de Brasília (9h UTC de segunda = 6h na escola)", () => {
    expect(agoraNaEscola(new Date("2026-10-12T09:00:00Z"))).toEqual({ data: "2026-10-12", hora: 6 });
    // 1h UTC de segunda ainda é domingo à noite em Brasília
    expect(agoraNaEscola(new Date("2026-10-12T01:00:00Z"))).toEqual({ data: "2026-10-11", hora: 22 });
  });
});

describe("conteúdo do cardápio", () => {
  it("aceita conteúdo válido e recusa vazio ou desalinhado", () => {
    expect(conteudoCardapioSchema.safeParse(conteudo).success).toBe(true);
    const vazio = { ...conteudo, itens: { seg: ["", ""], ter: ["", ""], qua: ["", ""], qui: ["", ""], sex: ["", ""] } };
    expect(conteudoCardapioSchema.safeParse(vazio).success).toBe(false);
    const desalinhado = { ...conteudo, itens: { ...conteudo.itens, seg: ["só um"] } };
    expect(conteudoCardapioSchema.safeParse(desalinhado).success).toBe(false);
  });

  it("semana precisa começar na segunda", () => {
    expect(salvarCardapioSchema.safeParse({ semanaInicio: "2026-10-13", conteudo }).success).toBe(false);
    expect(salvarCardapioSchema.safeParse({ semanaInicio: "2026-10-12", conteudo }).success).toBe(true);
  });

  it("texto do Mural: só dias e refeições preenchidos, com datas", () => {
    const t = textoCardapio("2026-10-12", conteudo, "Pode mudar conforme a safra.");
    expect(t).toContain("Segunda (12/10)\n• Lanche da manhã: Frutas\n• Almoço: Arroz, feijão e frango");
    expect(t).toContain("Terça (13/10)\n• Almoço: Macarrão");
    expect(t).toContain("Quinta (15/10)\n• Lanche da manhã: Bolo");
    expect(t).not.toContain("Quarta");
    expect(t).toContain("Observações: Pode mudar conforme a safra.");
    expect(tituloCardapio("2026-10-12")).toBe("🍽️ Cardápio da semana 12/10 a 16/10");
    expect(tituloCardapio("2026-10-12", "Maternal")).toContain("— Maternal");
  });
});

describe("dia sem cardápio (feriado)", () => {
  it("aparece no Mural com a nota no lugar das refeições", () => {
    const conteudo = {
      refeicoes: ["Almoço"],
      itens: { seg: ["Arroz"], ter: ["Arroz"], qua: ["Arroz"], qui: [""], sex: ["Arroz"] },
      semCardapio: { qui: "Feriado" },
    };
    const t = textoCardapio("2026-10-12", conteudo);
    expect(t).toContain("Quinta (15/10)\nFeriado — sem cardápio neste dia");
    expect(t).toContain("Quarta (14/10)");
    expect(conteudoCardapioSchema.safeParse(conteudo).success).toBe(true);
  });

  it("nota vazia não gera bloco e dia desconhecido é recusado", () => {
    const base = { refeicoes: ["Almoço"], itens: { seg: ["A"], ter: [""], qua: [""], qui: [""], sex: [""] } };
    expect(textoCardapio("2026-10-12", { ...base, semCardapio: { ter: "  " } })).not.toContain("Terça");
    expect(conteudoCardapioSchema.safeParse({ ...base, semCardapio: { dom: "x" } }).success).toBe(false);
  });
});
